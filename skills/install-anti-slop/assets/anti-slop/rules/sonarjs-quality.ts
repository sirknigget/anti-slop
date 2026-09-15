/*
 * Exposes official SonarJS quality rules through Anti-Slop.
 * Suite callbacks measure their own code without absorbing nested functions.
 */
import type { Context, CreateRule, ESTree, Visitor } from "@oxlint/plugins";
import { rules } from "eslint-plugin-sonarjs";

const sonarRules = rules as unknown as Record<string, CreateRule>;

type FunctionNode = ESTree.Node & {
  type: "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression";
};
const functionSelector = "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression";

// Returns one required public SonarJS rule or stops plugin loading with a clear error.
function getSonarRule(name: string): CreateRule {
  const rule = sonarRules[name];
  if (!rule) {
    throw new Error(`eslint-plugin-sonarjs does not export ${name}`);
  }
  return rule;
}

// Identifies the function nodes that can own executable statements.
function isFunction(node: ESTree.Node): node is FunctionNode {
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

// Counts source lines owned by the suite callback rather than its nested functions.
function ownLineCount(suite: FunctionNode, functions: FunctionNode[], context: Context): number {
  const nestedRanges = functions
    .filter(
      (node) => node !== suite && node.start >= suite.start && node.end <= suite.end,
    )
    .map(({ start, end }) => ({ start, end }));
  const lineNumbers = new Set<number>();
  for (const token of context.sourceCode.getTokens(suite)) {
    const isNested = nestedRanges.some(
      ({ start, end }) => token.start >= start && token.end <= end,
    );
    if (!isNested) {
      for (let line = token.loc.start.line; line <= token.loc.end.line; line += 1) {
        lineNumbers.add(line);
      }
    }
  }
  return lineNumbers.size;
}

// Reports suite-owned lines while the official rule checks every nested function.
function suiteAwareMaxLinesPerFunction(rule: CreateRule): CreateRule {
  return {
    ...rule,
    create(context) {
      const listeners = ignoreSuiteCallbacks(rule).create(context);
      const functions: FunctionNode[] = [];
      const suites: FunctionNode[] = [];
      const visitFunction = listeners[functionSelector] as
        | ((node: ESTree.Node) => void)
        | undefined;
      const exitProgram = listeners["Program:exit"] as
        | ((node: ESTree.Node) => void)
        | undefined;
      const threshold =
        (context.options[0] as { maximum?: number } | undefined)?.maximum ?? 200;
      return {
        ...listeners,
        [functionSelector](node: ESTree.Node) {
          visitFunction?.(node);
          if (isFunction(node)) {
            functions.push(node);
            if (isSuiteCallback(node)) {
              suites.push(node);
            }
          }
        },
        "Program:exit"(node: ESTree.Node) {
          exitProgram?.(node);
          for (const suite of suites) {
            const lineCount = ownLineCount(suite, functions, context);
            if (lineCount > threshold) {
              context.report({
                messageId: "functionMaxLine",
                data: {
                  lineCount: lineCount.toString(),
                  threshold: threshold.toString(),
                },
                loc: suite.loc,
              });
            }
          }
        },
      };
    },
  };
}

export const cognitiveComplexityRule = getSonarRule("cognitive-complexity");
export const cyclomaticComplexityRule = getSonarRule("cyclomatic-complexity");
export const maxLinesPerFunctionRule = suiteAwareMaxLinesPerFunction(
  getSonarRule("max-lines-per-function"),
);
export const maxLinesRule = getSonarRule("max-lines");
