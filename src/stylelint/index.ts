/*
 * Checks disabled CSS, orientation-dependent rotations, and important text spacing.
 * Uses the native Stylelint AST and reports source locations without changing CSS.
 * Keeps CSS tooling separate from the Oxlint entry points.
 */
import { CssSyntaxError, parse, type AnyNode, type Declaration } from "postcss";
import valueParser from "postcss-value-parser";
import stylelint from "stylelint";

const commentRuleName = "anti-slop/no-commented-css";
const orientationRuleName = "anti-slop/no-orientation-lock";
const spacingRuleName = "anti-slop/no-small-important-text-spacing";

const commentMessages = stylelint.utils.ruleMessages(commentRuleName, {
  rejected: "Remove commented-out CSS; source control retains its history.",
});
const orientationMessages = stylelint.utils.ruleMessages(orientationRuleName, {
  rejected: "Remove the orientation-dependent quarter-turn rotation.",
});
const spacingMessages = stylelint.utils.ruleMessages(spacingRuleName, {
  rejected: (property: string) =>
    `Remove !important from ${property} or increase its text spacing.`,
});

// A comment must contain code punctuation and parse as CSS, not just mention CSS.
function containsCss(text: string): boolean {
  if (!/[{}]|@[\w-]+[^;]*;|[\w-]+\s*:[^;]+;/u.test(text)) return false;
  try {
    const root = parse(text);
    return root.nodes.some((node) =>
      node.type === "rule" || node.type === "atrule" ||
      (node.type === "decl" && text.includes(";")),
    );
  } catch (error) {
    if (error instanceof CssSyntaxError) return false;
    throw error;
  }
}

// Reports comments that contain CSS accepted by the native parser.
const comments: stylelint.RuleBase<boolean> = (enabled) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, commentRuleName, { actual: enabled, possible: [true] })) return;
  root.walkComments((comment) => {
    if (containsCss(comment.text)) {
      stylelint.utils.report({ ruleName: commentRuleName, result, node: comment, message: commentMessages.rejected });
    }
  });
};

// Converts a supported angle value to degrees without inferring unresolved values.
function degrees(text: string): number | undefined {
  const dimension = valueParser.unit(text);
  if (!dimension) return undefined;
  const magnitude = Number(dimension.number);
  if (!Number.isFinite(magnitude)) return undefined;
  switch (dimension.unit.toLowerCase()) {
    case "":
    case "deg": return magnitude;
    case "rad": return magnitude * 180 / Math.PI;
    case "grad": return magnitude * 0.9;
    case "turn": return magnitude * 360;
    default: return undefined;
  }
}

// Detects rotations within thirty degrees of either quarter-turn direction.
function quarterTurn(angle: number | undefined): boolean {
  if (angle === undefined) return false;
  const halfTurnRemainder = ((angle % 180) + 180) % 180;
  return halfTurnRemainder >= 60 && halfTurnRemainder <= 120;
}

// Detects quarter-turn rotations in supported Z-axis functions and matrices.
function functionLocks(node: valueParser.FunctionNode): boolean {
  const name = node.value.toLowerCase();
  const args = node.nodes.filter((part) => part.type !== "space" && part.type !== "comment" && part.type !== "div");
  if (args.some((part) => part.type !== "word")) return false;
  const values = args.map((part) => part.value);
  if ((name === "rotate" || name === "rotatez") && values.length === 1) {
    return quarterTurn(degrees(values[0]));
  }
  if (name === "rotate3d" && values.length === 4) {
    if (Number(values[0]) !== 0 || Number(values[1]) !== 0 || !Number.isFinite(Number(values[2])) || Number(values[2]) === 0) return false;
    return quarterTurn(degrees(values[3]));
  }
  if ((name === "matrix" && values.length === 6) || (name === "matrix3d" && values.length === 16)) {
    if (!values.every((value) => Number.isFinite(Number(value)))) return false;
    return quarterTurn(Math.atan2(Number(values[1]), Number(values[0])) * 180 / Math.PI);
  }
  return false;
}

// Checks all function values and the standard individual rotate property.
function declarationLocks(declaration: Declaration): boolean {
  const parsed = valueParser(declaration.value);
  let locked = false;
  parsed.walk((node) => {
    if (node.type === "function" && functionLocks(node)) locked = true;
  });
  if (locked) return true;
  // The individual rotate property is a standard-property complement to transform().
  if (declaration.prop.toLowerCase() !== "rotate") return false;
  const parts = parsed.nodes.filter((node) => node.type !== "space" && node.type !== "comment");
  if (parts.some((node) => node.type !== "word")) return false;
  const values = parts.map((node) => node.value);
  if (values.length === 1) return quarterTurn(degrees(values[0]));
  if (values.length === 2 && values[0].toLowerCase() === "z") return quarterTurn(degrees(values[1]));
  if (values.length === 4 && Number(values[0]) === 0 && Number(values[1]) === 0 && Number.isFinite(Number(values[2])) && Number(values[2]) !== 0) return quarterTurn(degrees(values[3]));
  return false;
}

// Reports each matching declaration once under an orientation media ancestor.
const orientation: stylelint.RuleBase<boolean> = (enabled) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, orientationRuleName, { actual: enabled, possible: [true] })) return;
  root.walkDecls((declaration) => {
    // Includes Document ancestors when a custom syntax supplies multiple CSS roots.
    let parent: AnyNode | undefined = declaration.parent;
    while (parent) {
      if (parent.type === "atrule" && parent.name.toLowerCase() === "media" && parent.params.toLowerCase().includes("orientation")) {
        if (declarationLocks(declaration)) {
          stylelint.utils.report({ ruleName: orientationRuleName, result, node: declaration, message: orientationMessages.rejected });
        }
        break;
      }
      parent = parent.parent;
    }
  });
};

// Returns the minimum font-size ratio for each supported text-spacing property.
function spacingThreshold(property: string): number | undefined {
  switch (property) {
    case "word-spacing": return 0.16;
    case "letter-spacing": return 0.12;
    case "line-height": return 1.5;
    default: return undefined;
  }
}

// Font-relative conversions preserve the static analyzer's documented approximations.
function fontRelativeSpacing(text: string): number | undefined {
  const dimension = valueParser.unit(text);
  if (!dimension) return undefined;
  const magnitude = Number(dimension.number);
  if (!Number.isFinite(magnitude)) return undefined;
  switch (dimension.unit.toLowerCase()) {
    case "%": return magnitude / 100;
    case "ex": case "rex": case "ch": case "rch": return magnitude / 2;
    case "cap": case "rcap": return magnitude * 0.7;
    case "em": case "rem": case "ic": case "ric": return magnitude;
    default: return undefined;
  }
}

// Reports small supported font-relative values only on important text-spacing declarations.
const spacing: stylelint.RuleBase<boolean> = (enabled) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, spacingRuleName, { actual: enabled, possible: [true] })) return;
  root.walkDecls((declaration) => {
    const property = declaration.prop.trim().toLowerCase();
    const minimum = spacingThreshold(property);
    if (!declaration.important || minimum === undefined) return;
    let tooSmall = false;
    valueParser(declaration.value).walk((node) => {
      if (node.type !== "word") return;
      const relative = fontRelativeSpacing(node.value);
      if (relative !== undefined && relative < minimum) tooSmall = true;
    });
    if (tooSmall) {
      stylelint.utils.report({ ruleName: spacingRuleName, result, node: declaration, message: spacingMessages.rejected(property) });
    }
  });
};

// Exports optional CSS plugins without loading them from the Oxlint entry points.
export default [
  stylelint.createPlugin(commentRuleName, Object.assign(comments, { ruleName: commentRuleName, messages: commentMessages })),
  stylelint.createPlugin(orientationRuleName, Object.assign(orientation, { ruleName: orientationRuleName, messages: orientationMessages })),
  stylelint.createPlugin(spacingRuleName, Object.assign(spacing, { ruleName: spacingRuleName, messages: spacingMessages })),
];
