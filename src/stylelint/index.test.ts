/*
 * Tests CSS diagnostics through the public Stylelint plugin API.
 * Checks failing declarations and passing controls without changing source files.
 * Preserves the boundaries of static CSS inference.
 */
import assert from "node:assert/strict";
import stylelint from "stylelint";
import plugins from "./index.ts";

const comments = "anti-slop/no-commented-css";
const orientation = "anti-slop/no-orientation-lock";
const spacing = "anti-slop/no-small-important-text-spacing";

// Runs one fixture and checks its diagnostic count, rule, severity, and location.
async function expectWarnings(rule: string, code: string, count: number): Promise<void> {
  const report = await stylelint.lint({ code, codeFilename: "fixture.css", config: { plugins, rules: { [rule]: true } } });
  assert.equal(report.results.length, 1);
  const warnings = report.results[0].warnings;
  assert.equal(warnings.length, count, JSON.stringify({ rule, code, warnings }));
  for (const warning of warnings) {
    assert.equal(warning.rule, rule);
    assert.equal(warning.severity, "error");
    assert.ok(warning.line > 0);
    assert.ok(warning.column > 0);
  }
}

for (const text of [
  // Passes ordinary prose without code punctuation.
  "Explain the responsive layout.",
  // Passes a documentation URL without treating its colon as a declaration.
  "See https://example.com/docs; spacing follows the design.",
  // Passes prose with braces that does not parse as CSS.
  "Use {braces} in the documentation.",
  // Passes a property mention without a declaration terminator.
  "color: red is an example, not a declaration.",
  // Passes an incomplete rule instead of reporting invalid CSS as disabled code.
  ".broken { color: red;",
  // Passes a linter directive without CSS code.
  "stylelint-disable-next-line color-no-invalid-hex -- external palette",
]) {
  await expectWarnings(comments, `/* ${text} */ .live { color: red; }`, 0);
}
for (const text of [
  // Reports a complete disabled selector and declaration.
  ".removed { color: red; }",
  // Reports a disabled standalone declaration.
  "color: blue;",
  // Reports a disabled declaration with an empty value.
  "color: ;",
  // Reports a disabled empty rule.
  "p {}",
  // Reports a disabled attribute-selector rule.
  "a[href] { color: purple; }",
  // Reports a disabled terminated import.
  "@import url('old.css');",
  // Reports a disabled media rule with nested CSS.
  "@media (max-width: 500px) { .old { display: none; } }",
  // Reports disabled animation keyframes.
  "@keyframes old { from { opacity: 0; } to { opacity: 1; } }",
  // Reports a disabled rule across multiple lines.
  "\n.old {\n color: red;\n}\n",
]) {
  await expectWarnings(comments, `/* ${text} */`, 1);
}
// Reports both separate disabled-code comments.
await expectWarnings(comments, "/* color: red; */ /* .removed {} */", 2);

// Places a declaration under orientation media to exercise the conditional rule.
function oriented(declaration: string): string {
  return `@media (orientation: portrait) { .page { ${declaration} } }`;
}
for (const value of [
  // Reports a positive quarter turn in orientation media.
  "rotate(90deg)",
  // Reports a negative quarter turn in orientation media.
  "rotate(-90deg)",
  // Reports the other normalized quarter-turn direction.
  "rotate(270deg)",
  // Reports a quarter turn after removing a full revolution.
  "rotate(450deg)",
  // Reports the inclusive lower tolerance boundary.
  "rotate(60deg)",
  // Reports the inclusive upper tolerance boundary.
  "rotate(120deg)",
  // Reports a Z-axis quarter turn expressed in turns.
  "rotateZ(.25turn)",
  // Reports a quarter turn expressed in gradians.
  "rotate(100grad)",
  // Reports a quarter turn expressed in radians.
  "rotate(1.5708rad)",
  // Reports a positive Z-axis three-dimensional rotation.
  "rotate3d(0, 0, 1, 90deg)",
  // Reports a negative Z-axis three-dimensional rotation.
  "rotate3d(0, 0, -1, 90deg)",
  // Reports a matrix that rotates clockwise by a quarter turn.
  "matrix(0, 1, -1, 0, 0, 0)",
  // Reports a matrix that rotates counterclockwise by a quarter turn.
  "matrix(0, -1, 1, 0, 0, 0)",
  // Reports a three-dimensional matrix with a Z-axis quarter turn.
  "matrix3d(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
  // Reports a tolerated rotation beside an unrelated translation.
  "translateX(2px) rotate(92.5deg)",
]) {
  await expectWarnings(orientation, oriented(`transform: ${value};`), 1);
}
for (const value of [
  // Passes a zero rotation in orientation media.
  "rotate(0deg)",
  // Passes a rotation outside the quarter-turn tolerance.
  "rotate(45deg)",
  // Passes an angle below the lower tolerance boundary.
  "rotate(59.9deg)",
  // Passes an angle above the upper tolerance boundary.
  "rotate(120.1deg)",
  // Passes a full revolution in orientation media.
  "rotateZ(1turn)",
  // Passes an X-axis rotation without an orientation lock.
  "rotateX(90deg)",
  // Passes a Y-axis rotation without an orientation lock.
  "rotateY(90deg)",
  // Passes an unresolved rotation instead of guessing its angle.
  "rotate(var(--angle))",
  // Passes a three-dimensional X-axis rotation.
  "rotate3d(1, 0, 0, 90deg)",
  // Passes a fractional mixed-axis rotation instead of rounding its axis.
  "rotate3d(0.5, 0, 1, 90deg)",
  // Passes a zero-axis rotation that cannot rotate the element.
  "rotate3d(0, 0, 0, 90deg)",
  // Passes a translation without a rotation.
  "translate(90px)",
  // Passes scaling without a rotation.
  "scale(2)",
  // Passes an identity matrix with floating-point noise.
  "matrix(1, -1.22465e-15, 1.22465e-15, 1, 0, 0)",
]) {
  await expectWarnings(orientation, oriented(`transform: ${value};`), 0);
}
// Passes a quarter turn outside orientation media.
await expectWarnings(orientation, ".icon { transform: rotate(90deg); }", 0);
// Passes a quarter turn in media that does not test orientation.
await expectWarnings(orientation, "@media (min-width: 500px) { .icon { transform: rotate(90deg); } }", 0);
// Reports the custom-property rotation while leaving its unresolved reference alone.
await expectWarnings(orientation, oriented("--rotation: rotate(90deg); transform: var(--rotation);"), 1);
// Retains function-value checks on declarations other than transform.
await expectWarnings(orientation, oriented("background: rotate(90deg);"), 1);
// Passes quoted rotation text instead of treating it as a function.
await expectWarnings(orientation, oriented("content: 'rotate(90deg)';"), 0);
// Reports a rotation beneath a nested supports block.
await expectWarnings(orientation, "@media (orientation: landscape) { @supports (display: grid) { .page { transform: rotate(90deg); } } }", 1);
// Reports a declaration once when two orientation ancestors match.
await expectWarnings(orientation, "@media (orientation: landscape) { @media (orientation: portrait) { .page { transform: rotate(90deg); } } }", 1);
for (const value of [
  // Reports a standalone individual-property quarter turn.
  "90deg",
  // Reports an explicit individual-property Z-axis quarter turn.
  "z 90deg",
  // Reports an individual-property negative Z-axis quarter turn.
  "0 0 -1 .25turn",
]) {
  await expectWarnings(orientation, oriented(`rotate: ${value};`), 1);
}
for (const value of [
  // Passes a zero individual-property rotation.
  "0turn",
  // Passes an individual-property X-axis rotation.
  "x 90deg",
  // Passes a numeric individual-property X-axis rotation.
  "1 0 0 90deg",
  // Passes an individual-property angle outside the lock tolerance.
  "45deg",
]) {
  await expectWarnings(orientation, oriented(`rotate: ${value};`), 0);
}

for (const property of [
  // Checks important and normal line-height against its own threshold.
  "line-height",
  // Checks important and normal letter spacing against its own threshold.
  "letter-spacing",
  // Checks important and normal word spacing against its own threshold.
  "word-spacing",
]) {
  // Passes small spacing without an important annotation.
  await expectWarnings(spacing, `.text { ${property}: .01em; }`, 0);
  // Reports small spacing that has an important annotation.
  await expectWarnings(spacing, `.text { ${property}: .01em !important; }`, 1);
  // Reports negative important spacing below the threshold.
  await expectWarnings(spacing, `.text { ${property}: -0.1em !important; }`, 1);
  // Passes important spacing above the threshold.
  await expectWarnings(spacing, `.text { ${property}: 10em !important; }`, 0);
  // Passes unresolved spacing without guessing its computed value.
  await expectWarnings(spacing, `.text { ${property}: var(--spacing) !important; }`, 0);
  // Passes fixed units that need computed font information.
  await expectWarnings(spacing, `.text { ${property}: 10px !important; }`, 0);
}
for (const [property, value] of [
  // Passes word spacing at its em threshold.
  ["word-spacing", ".16em"],
  // Passes letter spacing at its em threshold.
  ["letter-spacing", ".12em"],
  // Passes line height at its em threshold.
  ["line-height", "1.5em"],
  // Passes word spacing at its percentage threshold.
  ["word-spacing", "16%"],
  // Passes letter spacing at the converted ex threshold.
  ["letter-spacing", ".24ex"],
  // Passes line height at the converted ch threshold.
  ["line-height", "3ch"],
  // Passes word spacing above the converted cap threshold.
  ["word-spacing", ".3cap"],
  // Passes letter spacing above the converted root-cap threshold.
  ["letter-spacing", ".2rcap"],
  // Passes line height at its retained root-ic threshold.
  ["line-height", "1.5ric"],
]) {
  await expectWarnings(spacing, `.text { ${property}: ${value} !important; }`, 0);
}
for (const unit of [
  // Reports a small em-relative value.
  "em",
  // Reports a small root-em-relative value.
  "rem",
  // Reports a small ex value after its approximate conversion.
  "ex",
  // Reports a small root-ex value after its approximate conversion.
  "rex",
  // Reports a small ch value after its approximate conversion.
  "ch",
  // Reports a small root-ch value after its approximate conversion.
  "rch",
  // Reports a small ic value using the retained em-equivalent conversion.
  "ic",
  // Reports a small root-ic value using the retained em-equivalent conversion.
  "ric",
  // Reports a small cap value after its approximate conversion.
  "cap",
  // Reports a small root-cap value after its approximate conversion.
  "rcap",
  // Reports a small percentage after conversion to a font-size ratio.
  "%",
]) {
  await expectWarnings(spacing, `.text { letter-spacing: .01${unit} !important; }`, 1);
}
// Reports case-insensitive text-spacing properties and important annotations.
await expectWarnings(spacing, ".text { LINE-HEIGHT: 1em !IMPORTANT; }", 1);
// Passes important declarations on unrelated properties.
await expectWarnings(spacing, ".text { color: red !important; margin: .01em !important; }", 0);
// These need computed font/DOM information; preserve the current static source contract.
await expectWarnings(spacing, ".text { line-height: 1.2 !important; letter-spacing: normal !important; }", 0);
// Retains small numeric-token detection inside a value function.
await expectWarnings(spacing, ".text { letter-spacing: calc(.01em + .01em) !important; }", 1);

// Passes disabled-code comments when the consumer disables the rule.
const disabled = await stylelint.lint({ code: "/* .removed {} */", config: { plugins, rules: { [comments]: null } } });
assert.equal(disabled.results[0].warnings.length, 0);
