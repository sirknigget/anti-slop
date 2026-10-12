/*
 * Detect simple class accessors that forward to the wrong established backing field.
 * Field declarations, parameter properties and direct constructor initialization
 * provide local evidence; computed and delegating accessor bodies remain unclassified.
 */

import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

// Resolve only statically known property keys, retaining private-field identity.
function propertyName(key: ESTree.PropertyKey, computed: boolean): string | null {
  if (key.type === "PrivateIdentifier") return `#${key.name}`;
  if (!computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

// A direct this-member access identifies local storage, not a delegated owner.
function fieldName(expression: ESTree.Expression): string | null {
  if (
    expression.type !== "MemberExpression" ||
    expression.object.type !== "ThisExpression" ||
    expression.optional
  ) return null;
  return propertyName(expression.property, expression.computed);
}

// Recognize accessor syntax and the specification's getX/setX naming convention.
function accessor(node: ESTree.MethodDefinition): { name: string; kind: "get" | "set" } | null {
  const name = propertyName(node.key, node.computed);
  if (name === null || name.startsWith("#")) return null;
  if (node.kind === "get" || node.kind === "set") return { name, kind: node.kind };
  if (node.kind !== "method") return null;
  const match = /^(get|set)([A-Z].*)$/.exec(name);
  if (match === null) return null;
  const suffix = match[2];
  const kind = match[1];
  if (suffix === undefined || (kind !== "get" && kind !== "set")) return null;
  return { name: suffix.charAt(0).toLowerCase() + suffix.slice(1), kind };
}

// Classify only direct forwarding; arbitrary accessor computations may be intentional.
function accessedField(node: ESTree.MethodDefinition, kind: "get" | "set"): string | null {
  const body = node.value.body?.body;
  if (body?.length !== 1) return null;
  const statement = body[0];
  if (statement === undefined) return null;
  if (kind === "get") {
    if (
      node.value.params.length !== 0 ||
      statement.type !== "ReturnStatement" ||
      statement.argument === null
    ) return null;
    return fieldName(statement.argument);
  }
  const parameter = node.value.params[0];
  if (
    node.value.params.length !== 1 ||
    parameter?.type !== "Identifier" ||
    statement.type !== "ExpressionStatement"
  ) return null;
  const assignment = statement.expression;
  if (
    assignment.type !== "AssignmentExpression" ||
    assignment.operator !== "=" ||
    assignment.right.type !== "Identifier" ||
    assignment.right.name !== parameter.name
  ) return null;
  if (assignment.left.type !== "MemberExpression") return null;
  return fieldName(assignment.left);
}

// Constructor parameter properties and direct initializations establish instance storage.
function addConstructorFields(node: ESTree.MethodDefinition, fields: Set<string>): void {
  for (const parameter of node.value.params) {
    if (parameter.type !== "TSParameterProperty") continue;
    const binding = parameter.parameter;
    if (binding.type === "Identifier") fields.add(binding.name);
    if (binding.type === "AssignmentPattern" && binding.left.type === "Identifier") {
      fields.add(binding.left.name);
    }
  }
  for (const statement of node.value.body?.body ?? []) {
    if (statement.type !== "ExpressionStatement") continue;
    const assignment = statement.expression;
    if (
      assignment.type !== "AssignmentExpression" ||
      assignment.operator !== "=" ||
      assignment.left.type !== "MemberExpression"
    ) continue;
    const name = fieldName(assignment.left);
    if (name !== null) fields.add(name);
  }
}

// Report copy/paste defects only when a unique local backing-field convention exists.
export const accessorFieldConsistencyRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Require simple class getters and setters to access their established backing field." },
    schema: [],
    messages: {
      wrongField: "This {{kind}} accesses '{{actual}}'; the locally declared backing field for '{{name}}' is '{{expected}}'.",
    },
  },
  // Register a class-local check without shared state between files.
  createOnce(context) {
    return {
      // Check each class against only its own established storage.
      ClassBody(node) {
        // Keep storage evidence class-local and separate static from instance members.
        const instanceFields = new Set<string>();
        const staticFields = new Set<string>();
        for (const member of node.body) {
          if (member.type === "MethodDefinition" && member.kind === "constructor") {
            addConstructorFields(member, instanceFields);
          }
          if (member.type !== "PropertyDefinition") continue;
          const name = propertyName(member.key, member.computed);
          if (name !== null) (member.static ? staticFields : instanceFields).add(name);
        }

        // A matching field is evidence of intent; ambiguity is not a defect diagnosis.
        for (const member of node.body) {
          if (member.type !== "MethodDefinition" || member.value.async || member.value.generator) continue;
          const description = accessor(member);
          if (description === null) continue;
          const fields = member.static ? staticFields : instanceFields;
          const candidates = [
            description.name,
            `_${description.name}`,
            `#${description.name}`,
            `#_${description.name}`,
          ].filter(name => fields.has(name));
          if (candidates.length !== 1) continue;
          const expected = candidates[0];
          const actual = accessedField(member, description.kind);
          if (expected === undefined || actual === null || actual === expected || !fields.has(actual)) continue;
          context.report({ node: member.key, messageId: "wrongField", data: { ...description, actual, expected } });
        }
      },
    };
  },
});
