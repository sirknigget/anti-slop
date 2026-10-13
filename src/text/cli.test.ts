import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../../dist/text/cli.js", import.meta.url));
const hiddenTags = String.fromCodePoint(0xe0061, 0xe0062);

// Exercises the published executable rather than mocked filesystem or Git modules.
function run(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

// Cleans real temporary fixtures even when an assertion fails.
function withDirectory(check: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "anti-slop-text-"));
  try {
    check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("explicit files preserve spaces and leading hyphens and return findings as JSON", () => {
  withDirectory((directory) => {
    writeFileSync(join(directory, "valid text.md"), "☀️ plain text\n");
    writeFileSync(join(directory, "-hidden text.md"), hiddenTags);
    assert.equal(run(directory, ["--", "valid text.md"]).status, 0);
    const result = run(directory, ["--json", "--", "-hidden text.md"]);
    assert.equal(result.status, 1);
    const findings = JSON.parse(result.stdout);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, "-hidden text.md");
    assert.equal(findings[0].rule, "hidden-unicode-tags");
    assert.equal(findings[0].line, 1);
    assert.equal(findings[0].column, 1);
  });
});

test("invalid arguments and explicit unreadable or binary inputs are errors, not clean scans", () => {
  withDirectory((directory) => {
    writeFileSync(join(directory, "binary.dat"), Buffer.from([0, 1, 2]));
    writeFileSync(join(directory, "invalid-utf8.dat"), Buffer.from([0xff]));
    for (const args of [[], ["--staged"], ["--git-root"], ["--unknown"], ["missing.txt"], ["binary.dat"], ["invalid-utf8.dat"], ["."]]) {
      const result = run(directory, args);
      assert.equal(result.status, 2);
      assert.notEqual(result.stderr.trim(), "");
    }
    assert.equal(run(directory, ["--help"]).status, 0);
  });
});

test("Git mode checks staged and unstaged text without scanning ignored files or binaries", () => {
  withDirectory((directory) => {
    execFileSync("git", ["init", "--quiet", directory]);
    writeFileSync(join(directory, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(directory, "tracked.md"), "clean\n");
    writeFileSync(join(directory, "binary.png"), Buffer.from([0, 1, 2]));
    writeFileSync(join(directory, "invalid.bin"), Buffer.from([0xff]));
    writeFileSync(join(directory, "deleted.txt"), "clean");
    execFileSync("git", ["-C", directory, "add", "--", "."]);
    rmSync(join(directory, "deleted.txt"));
    symlinkSync(join(directory, "tracked.md"), join(directory, "linked.md"));
    writeFileSync(join(directory, "ignored.txt"), hiddenTags);
    writeFileSync(join(directory, "untracked text.py"), hiddenTags);
    const staged = run(directory, ["--git-root", directory, "--staged", "--json"]);
    assert.equal(staged.status, 0);
    assert.deepEqual(JSON.parse(staged.stdout), []);
    const full = run(directory, ["--git-root", directory, "--json"]);
    assert.equal(full.status, 1);
    assert.equal(JSON.parse(full.stdout)[0].file, "untracked text.py");
    execFileSync("git", ["-C", directory, "add", "--", "untracked text.py"]);
    const violation = run(directory, ["--git-root", directory, "--staged", "--json"]);
    assert.equal(violation.status, 1);
    assert.equal(JSON.parse(violation.stdout)[0].file, "untracked text.py");
  });
});

test("staged text comes from the index even when the working copy differs or is deleted", () => {
  withDirectory((directory) => {
    execFileSync("git", ["init", "--quiet", directory]);
    const filename = join(directory, "staged text.md");
    writeFileSync(filename, hiddenTags);
    execFileSync("git", ["-C", directory, "add", "--", "staged text.md"]);
    writeFileSync(filename, "clean working copy");
    assert.equal(run(directory, ["--git-root", directory, "--staged"]).status, 1);
    assert.equal(run(directory, ["--git-root", directory]).status, 0);
    rmSync(filename);
    assert.equal(run(directory, ["--git-root", directory, "--staged"]).status, 1);
    writeFileSync(filename, "clean");
    execFileSync("git", ["-C", directory, "add", "--", "staged text.md"]);
    writeFileSync(filename, hiddenTags);
    assert.equal(run(directory, ["--git-root", directory, "--staged"]).status, 0);
    assert.equal(run(directory, ["--git-root", directory]).status, 1);
  });
});

test("Git roots normalize subdirectories and handle index blobs larger than a small stdout buffer", () => {
  withDirectory((directory) => {
    execFileSync("git", ["init", "--quiet", directory]);
    const nested = join(directory, "nested");
    mkdirSync(nested);
    writeFileSync(join(directory, "large.md"), "x".repeat(2 * 1024 * 1024) + hiddenTags);
    execFileSync("git", ["-C", directory, "add", "--", "large.md"]);
    const result = run(directory, ["--git-root", nested, "--staged", "--json"]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout)[0].file, "large.md");
  });
});

test("UTF-8 BOM is preserved in diagnostic columns", () => {
  withDirectory((directory) => {
    writeFileSync(join(directory, "bom.txt"), String.fromCharCode(0xfeff) + hiddenTags);
    const result = run(directory, ["--json", "bom.txt"]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout)[0].column, 2);
  });
});
