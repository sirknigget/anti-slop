/*
 * Exposes official SonarJS quality rules through Anti-Slop.
 * Suite callbacks are registration containers, not executable leaf tests.
 */
import type { CreateRule, ESTree, Visitor } from "@oxlint/plugins";
import { rules } from "eslint-plugin-sonarjs";

const sonarRules = rules as unknown as Record<string, CreateRule>;

// Returns one required public SonarJS rule or stops plugin loading with a clear error.
function getSonarRule(name: string): CreateRule {
  const rule = sonarRules[name];
  if (!rule) {
    throw new Error(`eslint-plugin-sonarjs does not export ${name}`);
  }
  return rule;
}

// Identifies the function nodes that can own executable statements.
function isFunction(node: ESTree.Node): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

// Returns true for one non-computed member with the specified name.
function hasMember(node: ESTree.Node, name: string): node is ESTree.MemberExpression {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier" &&
    node.property.name === name
  );
}

// Accepts describe, fdescribe, xdescribe, describe.only, and describe.skip.
function isDirectSuiteCallee(node: ESTree.Node): boolean {
  if (node.type === "Identifier") {
    return node.name === "describe" || node.name === "fdescribe" || node.name === "xdescribe";
  }
  return (
    (hasMember(node, "only") || hasMember(node, "skip")) &&
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    node.object.name === "describe"
  );
}

// Accepts describe.each and the only.each and skip.each variants.
function isEachSuiteFactory(node: ESTree.Node): boolean {
  return hasMember(node, "each") && node.type === "MemberExpression" && isDirectSuiteCallee(node.object);
}

// Accepts direct suite calls and the curried call returned by describe.each(table).
function isSuiteRegistrationCall(node: ESTree.Node): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  return (
    isDirectSuiteCallee(node.callee) ||
    isEachSuiteFactory(node.callee) ||
    (node.callee.type === "CallExpression" && isEachSuiteFactory(node.callee.callee))
  );
}

// Checks that the function is an argument of a recognized suite registration call.
function isSuiteCallback(node: ESTree.Node): boolean {
  const parent = node.parent;
  return (
    isFunction(node) &&
    parent?.type === "CallExpression" &&
    parent.arguments.some((argument) => argument === node) &&
    isSuiteRegistrationCall(parent)
  );
}

// Finds the closest function that owns the current listener event.
function nearestFunction(node: ESTree.Node): ESTree.Node | undefined {
  let current: ESTree.Node | null = node;
  while (current) {
    if (isFunction(current)) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

// Stops SonarJS traversal only while the nearest function is a suite callback.
function ignoreSuiteCallbacks(rule: CreateRule): CreateRule {
  return {
    ...rule,
    create(context) {
      const listeners = rule.create(context);
      const wrapped: Visitor = {};
      for (const [selector, rawListener] of Object.entries(listeners)) {
        const listener = rawListener as ((node: ESTree.Node) => void) | undefined;
        if (listener) {
          wrapped[selector] = (node) => {
            const owner = nearestFunction(node);
            if (!owner || !isSuiteCallback(owner)) {
              listener(node);
            }
          };
        }
      }
      return wrapped;
    },
  };
}

export const cognitiveComplexityRule = ignoreSuiteCallbacks(getSonarRule("cognitive-complexity"));
export const cyclomaticComplexityRule = ignoreSuiteCallbacks(getSonarRule("cyclomatic-complexity"));
export const maxLinesPerFunctionRule = ignoreSuiteCallbacks(getSonarRule("max-lines-per-function"));
export const maxLinesRule = getSonarRule("max-lines");
