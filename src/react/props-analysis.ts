/*
 * Analyzes React prop declarations and consumers with Oxlint's host ESTree API.
 * Resolves local types and value bindings without another parser or a TypeScript checker.
 * Shares one analysis per program between the unused-prop and default-prop rules.
 */
import type { Context, ESTree, Variable } from "@oxlint/plugins";

import { lexicalTypeParameterNames } from "../shared/lexical-type-parameters.ts";
import { createTypeAliasEnvironment, hasVisibleTypeBinding, resolvedTypeMatches, visibleTypeAlias } from "../shared/type-alias-resolution.ts";

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;
type ComponentNode = FunctionNode | ESTree.Class;
type LocalType = ESTree.TSTypeAliasDeclaration | ESTree.TSInterfaceDeclaration;
type Substitutions = ReadonlyMap<string, { readonly type: ESTree.TSType; readonly substitutions: Substitutions }>;

// Keeps declaration evidence separate from whether a component consumes the prop.
export type PropDeclaration = {
	readonly node: ESTree.Node;
	readonly required: boolean | null;
	readonly checkUnused: boolean;
};
type PropSet = { readonly props: Map<string, PropDeclaration>; readonly complete: boolean; readonly keyofKeys?: ReadonlySet<string> };

// Describes the contracts that the two public rules can report.
export type ReactPropsComponent = {
	readonly node: ComponentNode;
	readonly declaration: ESTree.Node;
	readonly props: Map<string, PropDeclaration>;
	readonly typedContract: PropSet;
	readonly runtimeContract: PropSet | null;
	readonly defaultContracts: readonly PropSet[];
	readonly defaults: Map<string, ESTree.Node> | null;
	readonly used: Set<string>;
	readonly consumesAll: boolean;
};
const analyses = new WeakMap<ESTree.Program, readonly ReactPropsComponent[]>();

// Accepts host AST nodes before traversing their structural fields.
function isNode(value: unknown): value is ESTree.Node & Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

// Traverses only host visitor-key children and permits pruning nested owners.
function walk(node: ESTree.Node, keys: Context["sourceCode"]["visitorKeys"], visit: (node: ESTree.Node) => void | boolean): void {
	if (visit(node) === false || !isNode(node)) return;
	for (const key of keys[node.type] ?? []) {
		const value: unknown = node[key];
		if (isNode(value)) walk(value, keys, visit);
		else if (Array.isArray(value)) for (const item of value) if (isNode(item)) walk(item, keys, visit);
	}
}

// Returns a static property name without interpreting source text.
function propertyName(node: ESTree.Node, computed = false): string | null {
	if (node.type === "Identifier" && !computed) return node.name;
	if (node.type === "Literal" && (typeof node.value === "string" || typeof node.value === "number")) return String(node.value);
	return null;
}

// Recognizes executable functions rather than TypeScript function signatures.
function isFunction(node: ESTree.Node): node is FunctionNode {
	return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}

// Finds the lexical block that owns a local type declaration.
function typeScope(node: ESTree.Node): ESTree.Node {
	let current = node.parent;
	while (current !== null) {
		if (current.type === "Program" || current.type === "BlockStatement" || current.type === "TSModuleBlock" || current.type === "StaticBlock" || current.type === "SwitchStatement") return current;
		current = current.parent;
	}
	return node;
}

// Combines known declarations while retaining unknown inherited or spread members.
function combine(left: PropSet, right: PropSet): PropSet {
	const props = new Map(left.props);
	for (const [name, declaration] of right.props) {
		const existing = props.get(name);
		props.set(name, existing ? { node: existing.node, required: existing.required || declaration.required, checkUnused: existing.checkUnused || declaration.checkUnused } : declaration);
	}
	if (left.keyofKeys || right.keyofKeys) {
		const keys = new Set(left.keyofKeys ?? left.props.keys());
		for (const name of right.keyofKeys ?? right.props.keys()) keys.add(name);
		return { props, complete: left.complete && right.complete, keyofKeys: keys };
	}
	return { props, complete: left.complete && right.complete };
}

// Removes transparent expression wrappers before resolving local bindings.
function unwrap(node: ESTree.Node): ESTree.Node {
	while (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression" || node.type === "TSNonNullExpression" || node.type === "ParenthesizedExpression" || node.type === "TSTypeAssertion") node = node.expression;
	return node;
}

// Analyzes one program once, using the host's existing lexical type and value information.
export function analyzeReactProps(program: ESTree.Program, context: Context): readonly ReactPropsComponent[] {
	const cached = analyses.get(program);
	if (cached) return cached;
	const keys = context.sourceCode.visitorKeys;
	const environment = createTypeAliasEnvironment(program, keys);
	const declarations: LocalType[] = [];
	const functions: FunctionNode[] = [];
	const classes: ESTree.Class[] = [];
	const assignments: ESTree.AssignmentExpression[] = [];
	const calls: ESTree.CallExpression[] = [];
	const jsxTargets: ESTree.JSXOpeningElement[] = [];
	const defaultExports: ESTree.ExportDefaultDeclaration[] = [];
	walk(program, keys, (node) => {
		if (node.type === "TSTypeAliasDeclaration" || node.type === "TSInterfaceDeclaration") declarations.push(node);
		if (isFunction(node)) functions.push(node);
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") classes.push(node);
		if (node.type === "AssignmentExpression") assignments.push(node);
		if (node.type === "CallExpression") calls.push(node);
		if (node.type === "JSXOpeningElement") jsxTargets.push(node);
		if (node.type === "ExportDefaultDeclaration") defaultExports.push(node);
	});

	// Resolves a value identifier by its host binding, not by a shared spelling.
	function variable(node: ESTree.Node): Variable | null {
		if (node.type !== "Identifier" && node.type !== "JSXIdentifier") return null;
		let scope = context.sourceCode.getScope(node);
		while (scope) {
			const reference = scope.references.find((reference) => reference.identifier === node);
			if (reference) return reference.resolved;
			const declared = scope.variables.find((item) => item.identifiers.some((identifier) => identifier === node));
			if (declared) return declared;
			if (node.type === "JSXIdentifier") {
				const jsxBinding = scope.variables.find((item) => item.name === node.name);
				if (jsxBinding) return jsxBinding;
			}
			const upper = scope.upper;
			if (!upper) break;
			scope = upper;
		}
		return null;
	}

	// Resolves immutable local values and stops at imports or mutable aliases.
	function value(node: ESTree.Node, seen = new Set<Variable>()): ESTree.Node | null {
		node = unwrap(node);
		if (node.type !== "Identifier" && node.type !== "JSXIdentifier") return node;
		const binding = variable(node);
		if (!binding || seen.has(binding) || binding.defs.length !== 1) return null;
		seen.add(binding);
		const definition = binding.defs[0];
		if (!definition) return null;
		if (definition.node.type === "FunctionDeclaration" || definition.node.type === "ClassDeclaration") return definition.node;
		if (definition.node.type !== "VariableDeclarator" || definition.node.parent.type !== "VariableDeclaration" || definition.node.parent.kind !== "const" || !definition.node.init) return null;
		return value(definition.node.init, seen);
	}

	// Recognizes React imports and import aliases while rejecting shadowed local names.
	function reactImport(node: ESTree.Node, seen = new Set<Variable>()): string | null {
		if (node.type === "Identifier") {
			const binding = variable(node);
			if (!binding || seen.has(binding) || binding.defs.length !== 1) return null;
			seen.add(binding);
			const definition = binding.defs[0]?.node;
			if (!definition) return null;
			if (definition.type === "VariableDeclarator" && definition.parent.type === "VariableDeclaration" && definition.parent.kind === "const" && definition.init) return reactImport(unwrap(definition.init), seen);
			if ((definition.type !== "ImportSpecifier" && definition.type !== "ImportDefaultSpecifier" && definition.type !== "ImportNamespaceSpecifier") || definition.parent.type !== "ImportDeclaration" || definition.parent.source.value !== "react") return null;
			return definition.type === "ImportSpecifier" ? propertyName(definition.imported) : "*";
		}
		if (node.type === "MemberExpression" && reactImport(node.object, seen) === "*") return propertyName(node.property, node.computed);
		if (node.type === "TSQualifiedName" && reactImport(node.left, seen) === "*") return node.right.name;
		return null;
	}

	// Finds one visible interface and respects imports, aliases, and generic type binders.
	function localType(name: string, use: ESTree.Node): LocalType | null {
		const alias = visibleTypeAlias(name, use, environment);
		if (alias) return alias;
		if (lexicalTypeParameterNames(use, keys).has(name)) return null;
		let current: ESTree.Node | null = use;
		while (current) {
			const bindings = environment.bindingsByName.get(name)?.filter((binding) => binding.scope === current) ?? [];
			if (bindings.length > 0) {
				if (bindings.length !== 1) return null;
				return declarations.find((declaration) => declaration.type === "TSInterfaceDeclaration" && declaration.id.name === name && typeScope(declaration) === current) ?? null;
			}
			current = current.parent;
		}
		return null;
	}

	// Builds generic substitutions from declared parameters and supplied type arguments.
	function instantiate(declaration: LocalType, arguments_: readonly ESTree.TSType[], outer: Substitutions): Substitutions {
		const result = new Map(outer);
		for (const [index, parameter] of (declaration.typeParameters?.params ?? []).entries()) {
			const argument = arguments_[index] ?? parameter.default;
			if (argument) result.set(parameter.name.name, { type: argument, substitutions: arguments_[index] ? outer : result });
			else result.delete(parameter.name.name);
		}
		return result;
	}

	// Excludes explicit forbidden props, including transparent local never aliases and substitutions.
	function isNever(type: ESTree.TSType, substitutions: Substitutions, seen = new Set<ESTree.Node>()): boolean {
		if (seen.has(type)) return false;
		seen.add(type);
		try {
			return resolvedTypeMatches(type, environment, (resolved, matches) => {
				if (resolved.type === "TSNeverKeyword") return true;
				if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation);
				if (resolved.type === "TSUnionType") return resolved.types.every(matches);
				if (resolved.type === "TSIntersectionType") return resolved.types.some(matches);
				if (resolved.type === "TSTypeReference" && resolved.typeName.type === "Identifier") {
					const substituted = substitutions.get(resolved.typeName.name);
					return substituted ? isNever(substituted.type, substituted.substitutions, seen) : false;
				}
				return false;
			});
		} finally { seen.delete(type); }
	}

	// Converts known property signatures to prop declarations without expanding imported types.
	function signatures(members: readonly ESTree.TSSignature[], substitutions: Substitutions): PropSet {
		const props = new Map<string, PropDeclaration>();
		let complete = true;
		for (const member of members) {
			if (member.type === "TSIndexSignature") complete = false;
			if (member.type !== "TSPropertySignature" && member.type !== "TSMethodSignature") continue;
			const name = propertyName(member.key, member.computed);
			if (name === null) { complete = false; continue; }
			props.set(name, { node: member.key, required: !member.optional, checkUnused: member.type !== "TSPropertySignature" || !member.typeAnnotation || !isNever(member.typeAnnotation.typeAnnotation, substitutions) });
		}
		return { props, complete };
	}

	// Resolves finite utility-type keys from local literal unions and keyof declarations.
	function finiteKeys(type: ESTree.TSType, substitutions: Substitutions, seen = new Set<ESTree.Node>()): Set<string> | null {
		if (seen.has(type)) return null;
		seen.add(type);
		try {
			if (type.type === "TSParenthesizedType") return finiteKeys(type.typeAnnotation, substitutions, seen);
			if (type.type === "TSLiteralType" && type.literal.type === "Literal" && typeof type.literal.value === "string") return new Set([type.literal.value]);
			if (type.type === "TSUnionType") {
				const result = new Set<string>();
				for (const part of type.types) {
					const keys = finiteKeys(part, substitutions, seen);
					if (!keys) return null;
					for (const key of keys) result.add(key);
				}
				return result;
			}
			if (type.type === "TSTypeOperator" && type.operator === "keyof") {
				if (isNever(type.typeAnnotation, substitutions)) return null;
				const declared = props(type.typeAnnotation, substitutions, seen);
				return declared.complete ? new Set(declared.keyofKeys ?? declared.props.keys()) : null;
			}
			if (type.type === "TSTypeReference" && type.typeName.type === "Identifier") {
				const substituted = substitutions.get(type.typeName.name);
				if (substituted) return finiteKeys(substituted.type, substituted.substitutions, seen);
				const alias = visibleTypeAlias(type.typeName.name, type, environment);
				if (alias) return finiteKeys(alias.typeAnnotation, instantiate(alias, type.typeArguments?.params ?? [], substitutions), seen);
			}
			return null;
		} finally { seen.delete(type); }
	}

	// Resolves local aliases, interface extensions, intersections, and common transparent wrappers.
	function props(type: ESTree.TSType | LocalType, substitutions: Substitutions = new Map(), seen = new Set<ESTree.Node>()): PropSet {
		if (seen.has(type)) return { props: new Map(), complete: false };
		seen.add(type);
		try {
			if (type.type === "TSParenthesizedType") return props(type.typeAnnotation, substitutions, seen);
			if (type.type === "TSTypeLiteral") return signatures(type.members, substitutions);
			if (type.type === "TSTypeAliasDeclaration") return props(type.typeAnnotation, substitutions, seen);
			if (type.type === "TSInterfaceDeclaration") {
				let result = signatures(type.body.body, substitutions);
				for (const extension of type.extends) {
					result = combine(result, referenceProps(extension.expression, extension, extension.typeArguments?.params ?? [], substitutions, seen));
				}
				return result;
			}
			if (type.type === "TSIntersectionType") {
				let result: PropSet = { props: new Map(), complete: true };
				for (const item of type.types) result = combine(result, props(item, substitutions, seen));
				return result;
			}
			if (type.type === "TSNeverKeyword") return { props: new Map(), complete: true };
			if (type.type === "TSUnionType") {
				let result: PropSet = { props: new Map(), complete: true };
				let common: Set<string> | null = null;
				for (const part of type.types) {
					if (isNever(part, substitutions)) continue;
					const declared = props(part, substitutions, seen);
					if (common === null) common = new Set(declared.keyofKeys ?? declared.props.keys());
					else for (const name of common) if (declared.keyofKeys ? !declared.keyofKeys.has(name) : !declared.props.has(name)) common.delete(name);
					result = combine(result, declared);
				}
				return { props: result.props, complete: result.complete, keyofKeys: common ?? new Set() };
			}
			return type.type === "TSTypeReference" ? referenceProps(type.typeName, type, type.typeArguments?.params ?? [], substitutions, seen) : { props: new Map(), complete: false };
		} finally { seen.delete(type); }
	}

	// Applies one named type path to aliases, interface heritage, and supported finite utilities.
	function referenceProps(typeName: ESTree.Node, use: ESTree.Node, arguments_: readonly ESTree.TSType[], substitutions: Substitutions, seen: Set<ESTree.Node>): PropSet {
		const name = typeName.type === "Identifier" ? typeName.name : null;
		const argument = arguments_[0];
		if (name && substitutions.has(name)) {
			const substituted = substitutions.get(name);
			return substituted ? props(substituted.type, substituted.substitutions, seen) : { props: new Map(), complete: false };
		}
		const declaration = name ? localType(name, use) : null;
		if (declaration) return props(declaration, instantiate(declaration, arguments_, substitutions), seen);
		const builtin = name && !hasVisibleTypeBinding(name, use, environment) ? name : reactImport(typeName);
		if (argument && (builtin === "Readonly" || builtin === "PropsWithChildren" || builtin === "Partial" || builtin === "Required")) {
			const result = props(argument, substitutions, seen);
			if (builtin === "Partial" || builtin === "Required") for (const [key, prop] of result.props) result.props.set(key, { ...prop, required: builtin === "Required" });
			if (builtin === "PropsWithChildren" && !isNever(argument, substitutions)) result.props.set("children", { node: use, required: false, checkUnused: true });
			return result;
		}
		if (argument && (builtin === "Pick" || builtin === "Omit")) {
			const keyType = arguments_[1];
			const selected = keyType ? finiteKeys(keyType, substitutions, seen) : null;
			if (!selected) return { props: new Map(), complete: false };
			const result = props(argument, substitutions, seen);
			for (const key of result.props.keys()) if (builtin === "Pick" ? !selected.has(key) : selected.has(key)) result.props.delete(key);
			if (result.keyofKeys) {
				const retained = new Set(result.keyofKeys);
				for (const key of retained) if (builtin === "Pick" ? !selected.has(key) : selected.has(key)) retained.delete(key);
				return { props: result.props, complete: result.complete, keyofKeys: retained };
			}
			return result;
		}
		if (argument && builtin === "Record") {
			const selected = finiteKeys(argument, substitutions, seen);
			if (!selected) return { props: new Map(), complete: false };
			const declarations = new Map<string, PropDeclaration>();
			for (const key of selected) declarations.set(key, { node: argument, required: true, checkUnused: true });
			return { props: declarations, complete: true };
		}
		return { props: new Map(), complete: false };
	}

	// Finds the declared component binding through standard React wrappers.
	function componentDeclaration(node: ComponentNode): ESTree.Node {
		let current: ESTree.Node = node;
		while (current.parent?.type === "CallExpression" && (reactImport(current.parent.callee) === "memo" || reactImport(current.parent.callee) === "forwardRef")) current = current.parent;
		return current.parent?.type === "VariableDeclarator" ? current.parent : node;
	}

	// Resolves standard React wrapper values while stopping at cyclic aliases.
	function componentValue(expression: ESTree.Node, seen = new Set<ESTree.Node>()): ESTree.Node | null {
		const resolved = value(expression);
		if (!resolved || seen.has(resolved)) return null;
		seen.add(resolved);
		if (resolved.type !== "CallExpression" || (reactImport(resolved.callee) !== "memo" && reactImport(resolved.callee) !== "forwardRef")) return resolved;
		const argument = resolved.arguments[0];
		return argument && argument.type !== "SpreadElement" ? componentValue(argument, seen) : null;
	}

	// Finds a React wrapper that supplies the function's component and generic context.
	function reactWrapper(node: FunctionNode): ESTree.CallExpression | null {
		for (const call of calls) {
			const imported = reactImport(call.callee);
			const argument = call.arguments[0];
			if ((imported === "memo" || imported === "forwardRef") && argument && argument.type !== "SpreadElement" && componentValue(argument) === node) return call;
		}
		return null;
	}

	// Resolves explicit FC types and their transparent local generic aliases.
	function functionComponentType(type: ESTree.TSType, substitutions: Substitutions = new Map(), seen = new Set<ESTree.Node>()): PropSet | null {
		if (seen.has(type)) return null;
		seen.add(type);
		if (type.type === "TSParenthesizedType") return functionComponentType(type.typeAnnotation, substitutions, seen);
		if (type.type !== "TSTypeReference") return null;
		const imported = reactImport(type.typeName);
		if (imported === "FC" || imported === "FunctionComponent") {
			const argument = type.typeArguments?.params[0];
			return argument ? props(argument, substitutions) : { props: new Map(), complete: true };
		}
		if (type.typeName.type !== "Identifier") return null;
		const alias = visibleTypeAlias(type.typeName.name, type, environment);
		if (!alias || seen.has(alias)) return null;
		seen.add(alias);
		return functionComponentType(alias.typeAnnotation, instantiate(alias, type.typeArguments?.params ?? [], substitutions), seen);
	}

	// Finds function prop annotations, FC annotations, and memo/forwardRef generic arguments.
	function functionProps(node: FunctionNode): PropSet {
		let parameter = node.params[0];
		if (parameter?.type === "TSParameterProperty") parameter = parameter.parameter;
		if (parameter?.type === "AssignmentPattern") parameter = parameter.left;
		const wrapperCall = reactWrapper(node);
		const declaration = wrapperCall?.parent.type === "VariableDeclarator" ? wrapperCall.parent : componentDeclaration(node);
		if (declaration.type === "VariableDeclarator" && declaration.id.typeAnnotation) {
			const declared = functionComponentType(declaration.id.typeAnnotation.typeAnnotation);
			if (declared) return declared;
		}
		if (wrapperCall) {
			const wrapper = reactImport(wrapperCall.callee);
			const argument = wrapperCall.typeArguments?.params[wrapper === "forwardRef" ? 1 : 0];
			if (argument) {
				const componentType = wrapper === "memo" ? functionComponentType(argument) : null;
				if (componentType) return componentType;
				const declared = props(argument);
				if (declared.complete || declared.props.size > 0) return declared;
			}
		}
		if (parameter && "typeAnnotation" in parameter && parameter.typeAnnotation) return props(parameter.typeAnnotation.typeAnnotation);
		return { props: new Map(), complete: false };
	}

	// Recognizes rendered functions and explicit React function-component declarations.
	function isComponentFunction(node: FunctionNode): boolean {
		if (!node.body || node.parent.type === "MethodDefinition") return false;
		if (reactWrapper(node)) return true;
		const declaration = componentDeclaration(node);
		if (declaration.type === "VariableDeclarator" && declaration.id.typeAnnotation && functionComponentType(declaration.id.typeAnnotation.typeAnnotation)) return true;
		// Does not reinterpret array/render callbacks or lower-case helpers as component props.
		if (node.parent.type === "CallExpression") return false;
		const bindingName = declaration.type === "VariableDeclarator" && declaration.id.type === "Identifier" ? declaration.id.name : node.id?.name ?? (node.parent.type === "PropertyDefinition" ? propertyName(node.parent.key, node.parent.computed) : null);
		const initial = bindingName?.charAt(0);
		const conventional = initial !== undefined && initial.toUpperCase() === initial && initial.toLowerCase() !== initial;
		const exportedDefault = defaultExports.some((export_) => componentValue(export_.declaration) === node);
		const usedInJsx = jsxTargets.some((target) => target.name.type === "JSXIdentifier" && !(target.name.name.charCodeAt(0) >= 97 && target.name.name.charCodeAt(0) <= 122) && componentValue(target.name) === node);
		if (!conventional && !exportedDefault && !usedInJsx && !metadata(node, declaration, "propTypes") && !metadata(node, declaration, "defaultProps")) return false;
		let renders = false;
		walk(node.body, keys, (child) => {
			if (child.type === "ClassDeclaration" || child.type === "ClassExpression") return false;
			if (child.type === "JSXElement" || child.type === "JSXFragment" || child.type === "CallExpression" && reactImport(child.callee) === "createElement") renders = true;
		});
		return renders;
	}

	// Resolves local React class inheritance without assuming an arbitrary imported class is React.
	function parentClass(node: ESTree.Class): ESTree.Class | null {
		const parent = node.superClass ? value(node.superClass) : null;
		return parent?.type === "ClassDeclaration" || parent?.type === "ClassExpression" ? parent : null;
	}

	// Accepts Component/PureComponent imports and their known local subclasses.
	function isReactClass(node: ESTree.Class, seen = new Set<ESTree.Class>()): boolean {
		if (seen.has(node) || !node.superClass) return false;
		seen.add(node);
		const imported = reactImport(node.superClass);
		if (imported === "Component" || imported === "PureComponent") return true;
		const parent = parentClass(node);
		return parent !== null && isReactClass(parent, seen);
	}

	// Reads known object entries and records whether every spread was resolved locally.
	function objectEntries(expression: ESTree.Node, seen = new Set<ESTree.Node>()): { entries: Map<string, { readonly property: ESTree.ObjectProperty; readonly stable: boolean }>; complete: boolean } {
		const object = value(expression);
		const entries = new Map<string, { readonly property: ESTree.ObjectProperty; readonly stable: boolean }>();
		if (!object || object.type !== "ObjectExpression" || seen.has(object)) return { entries, complete: false };
		seen.add(object);
		let complete = true;
		for (const property of object.properties) {
			if (property.type === "SpreadElement") {
				const spread = objectEntries(property.argument, seen);
				// Keeps known keys but marks validator values that an unresolved spread can replace.
				if (!spread.complete) for (const [key, entry] of entries) entries.set(key, { property: entry.property, stable: false });
				complete = complete && spread.complete;
				for (const [key, entry] of spread.entries) entries.set(key, entry);
			} else {
				const name = propertyName(property.key, property.computed);
				if (name === null) {
					complete = false;
					for (const [key, entry] of entries) entries.set(key, { property: entry.property, stable: false });
				}
				else entries.set(name, { property, stable: true });
			}
		}
		seen.delete(object);
		return { entries, complete };
	}

	// Returns explicit propTypes/defaultProps values for a component, including static class fields.
	function metadata(node: ComponentNode, declaration: ESTree.Node, key: string): ESTree.Node | null {
		let found: ESTree.Node | null = null;
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") for (const property of node.body.body) {
			if (property.type === "PropertyDefinition" && property.static && propertyName(property.key, property.computed) === key) found = property.value;
		}
		for (const assignment of assignments) {
			if (assignment.operator !== "=" || assignment.left.type !== "MemberExpression" || propertyName(assignment.left.property, assignment.left.computed) !== key) continue;
			const binding = variable(assignment.left.object);
			if (binding?.defs.some((definition) => definition.node === declaration) || componentValue(assignment.left.object) === node) found = assignment.right;
		}
		return found;
	}

	// Adds runtime requiredness without treating TypeScript as a runtime PropTypes replacement.
	function runtimeProps(expression: ESTree.Node): PropSet {
		const result = objectEntries(expression);
		const declarations = new Map<string, PropDeclaration>();
		for (const [name, entry] of result.entries) {
			const property = entry.property;
			const validator = value(property.value) ?? unwrap(property.value);
			const required = entry.stable ? validator.type === "MemberExpression" && propertyName(validator.property, validator.computed) === "isRequired" : null;
			declarations.set(name, { node: property.key, required, checkUnused: true });
		}
		return { props: declarations, complete: result.complete };
	}

	// Tracks real reads, aliases, destructuring, and whole-props escapes using host scope references.
	function usage(node: ComponentNode, declared: ReadonlyMap<string, PropDeclaration>, blocked: ReadonlySet<string> = new Set()): { used: Set<string>; consumesAll: boolean } {
		const used = new Set<string>();
		const visited = new Set<Variable>();
		const noExclusions: ReadonlySet<string> = new Set();
		let consumesAll = false;

		// Records a whole-object consumer without restoring fields excluded by a rest pattern.
		function markAll(excluded: ReadonlySet<string>): void {
			if (excluded.size === 0) consumesAll = true;
			else for (const name of declared.keys()) if (!excluded.has(name)) used.add(name);
		}

		// Returns whether a bound pattern has a read reference, not merely a declaration.
		function patternRead(pattern: ESTree.BindingPattern): boolean {
			if (pattern.type === "Identifier") return variable(pattern)?.references.some((reference) => reference.isRead()) ?? false;
			if (pattern.type === "AssignmentPattern") return patternRead(pattern.left);
			if (pattern.type === "ArrayPattern") return pattern.elements.some((item) => item && patternRead(item.type === "RestElement" ? item.argument : item));
			return pattern.properties.some((property) => patternRead(property.type === "RestElement" ? property.argument : property.value));
		}

		// Follows aliases and rest objects without treating an excluded, unread field as consumed.
		function patternUsage(pattern: ESTree.BindingPattern, excluded = noExclusions): void {
			if (pattern.type === "AssignmentPattern") { patternUsage(pattern.left, excluded); return; }
			if (pattern.type === "Identifier") {
				const binding = variable(pattern);
				if (!binding || visited.has(binding)) return;
				visited.add(binding);
				for (const reference of binding.references) if (reference.isRead()) referenceUsage(reference.identifier, excluded);
				return;
			}
			if (pattern.type === "ArrayPattern") { if (patternRead(pattern)) markAll(excluded); return; }
			const restExcluded = pattern.properties.some((property) => property.type === "RestElement") ? new Set(excluded) : null;
			if (restExcluded) for (const property of pattern.properties) {
				if (property.type === "RestElement") continue;
				const name = propertyName(property.key, property.computed);
				if (name !== null) restExcluded.add(name);
			}
			for (const property of pattern.properties) {
				if (property.type === "RestElement") { patternUsage(property.argument, restExcluded ?? excluded); continue; }
				if (!patternRead(property.value)) continue;
				const name = propertyName(property.key, property.computed);
				if (name === null) markAll(excluded);
				else if (!excluded.has(name)) used.add(name);
			}
		}

		// Treats delegated whole objects as consumers, but excludes writes to individual props.
		function referenceUsage(reference: ESTree.Node, excluded = noExclusions): void {
			const parent = reference.parent;
			if (!parent) return;
			if (parent.type === "MemberExpression" && parent.object === reference) {
				if (parent.parent.type === "AssignmentExpression" && parent.parent.left === parent && parent.parent.operator === "=") return;
				const name = propertyName(parent.property, parent.computed);
				if (name === null) markAll(excluded);
				else if (!excluded.has(name)) used.add(name);
				return;
			}
			if (parent.type === "TSAsExpression" || parent.type === "TSSatisfiesExpression" || parent.type === "TSNonNullExpression" || parent.type === "TSTypeAssertion" || parent.type === "ParenthesizedExpression") { referenceUsage(parent, excluded); return; }
			if (parent.type === "ConditionalExpression" && parent.test !== reference || parent.type === "LogicalExpression" && (parent.right === reference || parent.operator !== "&&")) { referenceUsage(parent, excluded); return; }
			if (parent.type === "VariableDeclarator" && parent.init === reference) { patternUsage(parent.id, excluded); return; }
			if (parent.type === "CallExpression" || parent.type === "NewExpression") {
				// Framework constructor initialization is not an application prop consumer.
				if (parent.callee.type !== "Super" && parent.arguments.some((argument) => argument === reference)) markAll(excluded);
				return;
			}
			if (parent.type === "AssignmentExpression" && parent.right === reference && parent.left.type === "MemberExpression" && parent.left.object.type === "ThisExpression" && propertyName(parent.left.property, parent.left.computed) === "props") return;
			if (parent.type === "JSXSpreadAttribute" || parent.type === "SpreadElement" || parent.type === "ReturnStatement" || parent.type === "AssignmentExpression" && parent.right === reference) markAll(excluded);
			if (parent.type === "BinaryExpression" && parent.operator === "in" && parent.right === reference) {
				const name = propertyName(parent.left, true);
				if (name !== null && !excluded.has(name)) used.add(name);
			}
		}

		// Keeps this.props reads with their real class receiver, including lexical arrows.
		function ownsThis(reference: ESTree.Node): boolean {
			let current = reference.parent;
			while (current) {
				if (current.type === "ClassDeclaration" || current.type === "ClassExpression") return current === node;
				if (current.type === "StaticBlock" || (current.type === "MethodDefinition" || current.type === "PropertyDefinition") && current.static) return false;
				if (isFunction(current) && current.type !== "ArrowFunctionExpression" && current.parent.type !== "MethodDefinition") return false;
				current = current.parent;
			}
			return false;
		}

		if (isFunction(node)) {
			const first = node.params[0];
			if (first && first.type !== "RestElement") patternUsage(first.type === "TSParameterProperty" ? first.parameter : first);
		} else {
			walk(node.body, keys, (child) => {
				if (child.type === "ClassDeclaration" || child.type === "ClassExpression") return false;
				if ((child.type === "MethodDefinition" || child.type === "PropertyDefinition") && child.parent === node.body && !child.static && propertyName(child.key, child.computed) !== "constructor") {
					const name = propertyName(child.key, child.computed);
					if (name !== null && blocked.has(name)) return false;
				}
				if (child.type === "MemberExpression" && child.object.type === "ThisExpression" && propertyName(child.property, child.computed) === "props" && ownsThis(child)) referenceUsage(child);
				if (child.type === "MethodDefinition" && child.kind === "constructor") {
					const first = child.value.params[0];
					if (first && first.type !== "RestElement") patternUsage(first.type === "TSParameterProperty" ? first.parameter : first);
				}
			});
		}
		return { used, consumesAll };
	}

	// Keeps inherited consumers only when their methods remain active or are read through super.
	function componentUsage(node: ComponentNode, declared: ReadonlyMap<string, PropDeclaration>, blocked: ReadonlySet<string> = new Set(), seen = new Set<ESTree.Class>()): { used: Set<string>; consumesAll: boolean } {
		const consumed = usage(node, declared, blocked);
		if (isFunction(node) || seen.has(node)) return consumed;
		seen.add(node);
		const parent = parentClass(node);
		if (!parent || !isReactClass(parent)) return consumed;
		const inheritedBlocked = new Set(blocked);
		for (const member of node.body.body) {
			if ((member.type !== "MethodDefinition" && member.type !== "PropertyDefinition") || member.static) continue;
			const name = propertyName(member.key, member.computed);
			if (name !== null && name !== "constructor") inheritedBlocked.add(name);
		}
		walk(node.body, keys, (child) => {
			if (child.type === "ClassDeclaration" || child.type === "ClassExpression") return false;
			if ((child.type === "MethodDefinition" || child.type === "PropertyDefinition") && child.parent === node.body) {
				const name = propertyName(child.key, child.computed);
				if (child.static || name !== null && blocked.has(name)) return false;
			}
			if (child.type === "MemberExpression" && child.object.type === "Super") {
				const name = propertyName(child.property, child.computed);
				if (name === null) inheritedBlocked.clear();
				else inheritedBlocked.delete(name);
			}
		});
		const inherited = componentUsage(parent, declared, inheritedBlocked, seen);
		for (const name of inherited.used) consumed.used.add(name);
		return { used: consumed.used, consumesAll: consumed.consumesAll || inherited.consumesAll };
	}

	const models = new Map<ComponentNode, ReactPropsComponent>();
	const building = new Set<ComponentNode>();

	// Builds each component contract and keeps inherited declaration and consumer evidence.
	function model(node: ComponentNode): ReactPropsComponent | null {
		const existing = models.get(node);
		if (existing) return existing;
		if (building.has(node)) return null;
		building.add(node);
		const declaration = componentDeclaration(node);
		let declared: PropSet;
		let inherited: ReactPropsComponent | null = null;
		if (isFunction(node)) declared = functionProps(node);
		else {
			const parent = parentClass(node);
			if (parent && isReactClass(parent)) inherited = model(parent);
			const type = node.superTypeArguments?.params[0];
			declared = type ? props(type) : inherited?.typedContract ?? { props: new Map(), complete: false };
		}
		const typedContract = declared;
		const defaultContracts: PropSet[] = [];
		if (declared.complete || declared.props.size > 0) defaultContracts.push(declared);
		const runtime = metadata(node, declaration, "propTypes");
		const runtimeContract = runtime ? runtimeProps(runtime) : inherited?.runtimeContract ?? null;
		if (runtimeContract) {
			defaultContracts.push(runtimeContract);
			declared = declared.props.size === 0 ? runtimeContract : combine(declared, runtimeContract);
		}
		const defaults = metadata(node, declaration, "defaultProps");
		const defaultEntries = defaults ? objectEntries(defaults) : null;
		const consumed = componentUsage(node, declared.props);
		const result: ReactPropsComponent = { node, declaration, props: declared.props, typedContract, runtimeContract, defaultContracts, defaults: defaultEntries ? new Map([...defaultEntries.entries].map(([name, entry]) => [name, entry.property.key])) : inherited?.defaults ?? null, used: consumed.used, consumesAll: consumed.consumesAll };
		models.set(node, result);
		building.delete(node);
		return result;
	}
	for (const node of functions) if (isComponentFunction(node)) model(node);
	for (const node of classes) if (isReactClass(node)) model(node);

	// Resolves a factory target to an actual component binding, including immutable aliases.
	function targetModel(target: ESTree.Node): ReactPropsComponent | null {
		const resolved = value(target);
		if (!resolved) return null;
		if (isFunction(resolved) || resolved.type === "ClassDeclaration" || resolved.type === "ClassExpression") return models.get(resolved) ?? null;
		if (resolved.type === "CallExpression" && (reactImport(resolved.callee) === "memo" || reactImport(resolved.callee) === "forwardRef")) {
			const argument = resolved.arguments[0];
			return argument && argument.type !== "SpreadElement" ? targetModel(argument) : null;
		}
		return null;
	}

	// Recognizes typed callback declarations that refer to the component's actual prop members.
	function factoryConsumers(factory: ESTree.CallExpression, target: ReactPropsComponent): void {
		for (const argument of factory.arguments) {
			if (!isFunction(argument)) continue;
			const declared = functionProps(argument);
			if (declared.props.size === 0) continue;
			const consumed = usage(argument, declared.props);
			for (const [name, prop] of declared.props) {
				if (target.props.get(name)?.node !== prop.node) continue;
				if (consumed.consumesAll || consumed.used.has(name)) target.used.add(name);
			}
		}
	}
	for (const call of calls) if (call.callee.type === "CallExpression") for (const target of call.arguments) {
		const component = targetModel(target);
		if (component) factoryConsumers(call.callee, component);
	}
	for (const node of classes) {
		const component = models.get(node);
		if (!component) continue;
		for (const decorator of node.decorators) if (decorator.expression.type === "CallExpression") factoryConsumers(decorator.expression, component);
	}
	const result = [...models.values()];
	analyses.set(program, result);
	return result;
}
