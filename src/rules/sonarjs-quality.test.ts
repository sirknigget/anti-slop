/*
 * Runs the published Anti-Slop plugin through Oxlint.
 * Temporary fixtures protect suite-owned metrics and nested-function checks.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = resolve(import.meta.dirname, "..", "..");
const oxlintPackage = require.resolve("oxlint/package.json");
const oxlint = join(dirname(oxlintPackage), "bin", "oxlint");
const temporaryRoot = mkdtempSync(join(tmpdir(), "anti-slop-quality-"));
const configPath = join(temporaryRoot, ".oxlintrc.json");
const qualityRuleIds = [
  "anti-slop/cognitive-complexity",
  "anti-slop/cyclomatic-complexity",
  "anti-slop/max-lines-per-function",
] as const;

// Creates one callback body that exceeds all three function thresholds.
function complexBody(indent: string): string {
  const lines = [
    `${indent}const values = Array.from({ length: 13 }, () => true);`,
    `${indent}let score = 0;`,
  ];
  for (let index = 0; index < 13; index += 1) {
    lines.push(
      `${indent}if (values[${index}]) {`,
      `${indent}  score += ${index};`,
      `${indent}}`,
    );
  }
  for (let index = 0; index < 15; index += 1) {
    lines.push(`${indent}score += ${index};`);
  }
  lines.push(`${indent}void score;`);
  return lines.join("\n");
}

// Creates direct suite code that exceeds both complexity thresholds in fewer than 50 lines.
function branchingBody(indent: string): string {
  const lines = [
    `${indent}const values = Array.from({ length: 13 }, () => true);`,
    `${indent}let score = 0;`,
  ];
  for (let index = 0; index < 13; index += 1) {
    lines.push(`${indent}if (values[${index}]) score += ${index};`);
  }
  lines.push(`${indent}void score;`);
  return lines.join("\n");
}

// Creates enough short leaf tests to make the suite's full source range exceed 50 lines.
function nestedTests(indent: string): string {
  return Array.from(
    { length: 17 },
    (_, index) =>
      `${indent}it('case ${index}', () => {\n${indent}  expect(${index}).toBe(${index});\n${indent}});`,
  ).join("\n");
}

// Creates direct suite code that exceeds only the function-length threshold.
function longBody(indent: string): string {
  return Array.from({ length: 51 }, (_, index) => `${indent}void ${index};`).join("\n");
}

// Writes one fixture into the isolated test directory.
function writeFixture(name: string, source: string): string {
  const path = join(temporaryRoot, name);
  writeFileSync(path, `${source}\n`);
  return path;
}

// Runs Oxlint with the built plugin and returns its observable process result.
function lint(...fixtures: string[]): { status: number | null; output: string } {
  const result = spawnSync(
    oxlint,
    ["--config", configPath, "--format=json", "--disable-nested-config", ...fixtures],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

// Converts Oxlint's plugin code format into the configured namespace format.
function reportedRuleIds(output: string): string[] {
  const report = JSON.parse(output) as { diagnostics: Array<{ code: string }> };
  return report.diagnostics.map(({ code }) => code.replace(/^([^()]+)\((.+)\)$/u, "$1/$2"));
}

// Requires one fixture to fail with the specified quality rules and no others.
function expectRuleViolations(
  name: string,
  source: string,
  expectedRuleIds: readonly string[],
): void {
  const result = lint(writeFixture(name, source));
  assert.equal(result.status, 1, result.output);
  const reported = reportedRuleIds(result.output).sort();
  assert.deepEqual(reported, [...expectedRuleIds].sort(), result.output);
}

// Requires one fixture to fail with every function-quality rule.
function expectFunctionViolations(name: string, source: string): void {
  expectRuleViolations(name, source, qualityRuleIds);
}

// Defines the real package configuration used for all black-box fixtures.
writeFileSync(
  configPath,
  JSON.stringify({
    categories: { correctness: "off" },
    env: { jest: true, node: true },
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: join(packageRoot, "dist", "index.js"),
      },
    ],
    rules: {
      "anti-slop/cognitive-complexity": ["error", 12],
      "anti-slop/cyclomatic-complexity": ["error", { threshold: 8 }],
      "anti-slop/max-lines": ["error", { maximum: 500 }],
      "anti-slop/max-lines-per-function": ["error", { maximum: 50 }],
    },
  }),
);

try {
  const suiteForms = [
    ["describe", "describe('suite', () => {"],
    ["describe-only", "describe.only('suite', () => {"],
    ["describe-skip", "describe.skip('suite', () => {"],
    ["describe-each", "describe.each([[1]])('suite', () => {"],
    ["describe-only-each", "describe.only.each([[1]])('suite', () => {"],
    ["describe-skip-each", "describe.skip.each([[1]])('suite', () => {"],
    ["fdescribe", "fdescribe('suite', () => {"],
    ["xdescribe", "xdescribe('suite', () => {"],
  ] as const;
  const suiteFixtures = suiteForms.map(([name, call]) =>
    writeFixture(`${name}.ts`, `${call}\n${nestedTests("  ")}\n});`),
  );
  const suitesResult = lint(...suiteFixtures);
  assert.equal(suitesResult.status, 0, suitesResult.output);

  const nestedSuite = writeFixture(
    "nested-suite.ts",
    `describe('outer', () => {\n  describe('inner', () => {\n${nestedTests("    ")}\n  });\n});`,
  );
  const nestedResult = lint(nestedSuite);
  assert.equal(nestedResult.status, 0, nestedResult.output);

  expectRuleViolations(
    "describe-direct-complexity.ts",
    `describe('suite', () => {\n${branchingBody("  ")}\n});`,
    ["anti-slop/cognitive-complexity", "anti-slop/cyclomatic-complexity"],
  );
  expectRuleViolations(
    "describe-direct-length.ts",
    `describe('suite', () => {\n${longBody("  ")}\n});`,
    ["anti-slop/max-lines-per-function"],
  );

  const compliant = writeFixture(
    "compliant.ts",
    "describe('small suite', () => {\n  it('keeps a small leaf valid', () => {\n    expect(1).toBe(1);\n  });\n});",
  );
  const compliantResult = lint(compliant);
  assert.equal(compliantResult.status, 0, compliantResult.output);

  expectFunctionViolations(
    "it-callback.ts",
    `describe('suite', () => {\n  it('checks a large leaf', () => {\n${complexBody("    ")}\n  });\n});`,
  );
  expectFunctionViolations(
    "test-callback.ts",
    `describe('suite', () => {\n  test('checks a large leaf', () => {\n${complexBody("    ")}\n  });\n});`,
  );
  expectFunctionViolations(
    "hook-callback.ts",
    `describe('suite', () => {\n  beforeEach(() => {\n${complexBody("    ")}\n  });\n});`,
  );
  expectFunctionViolations(
    "helper-callback.ts",
    `describe('suite', () => {\n  [1].map(() => {\n${complexBody("    ")}\n  });\n});`,
  );
  expectFunctionViolations(
    "ordinary-function.ts",
    `describe('suite', () => {\n  function calculate(): void {\n${complexBody("    ")}\n  }\n  void calculate;\n});`,
  );

  const largeFile = writeFixture(
    "large-file.ts",
    Array.from({ length: 501 }, (_, index) => `void ${index};`).join("\n"),
  );
  const fileResult = lint(largeFile);
  assert.equal(fileResult.status, 1, fileResult.output);
  assert.ok(reportedRuleIds(fileResult.output).includes("anti-slop/max-lines"), fileResult.output);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
