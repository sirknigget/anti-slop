#!/usr/bin/env node
/*
 * Checks explicit UTF-8 files or Git-selected repository text without a parser.
 * Git modes exclude binary files and symlinks; staged mode reads index blobs.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { scanText } from "./scan.ts";

const usage = "Usage: anti-slop-text [--json] [--] FILE... | --git-root ROOT [--staged] [--json]";

interface TextInput {
  filename: string;
  blob?: string;
}

// Parses a small explicit interface without shell expansion or filename guessing.
function parseArguments(args: string[]) {
  let root: string | undefined;
  let staged = false;
  let json = false;
  const files: string[] = [];
  let positional = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (positional) {
      files.push(arg);
    } else if (arg === "--") {
      positional = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--staged") {
      staged = true;
    } else if (arg === "--git-root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--git-root requires a directory.");
      root = resolve(value);
      index += 1;
    } else if (arg === "--help") {
      console.log(usage);
      return;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}. Use -- before a filename beginning with a hyphen.`);
    } else {
      files.push(arg);
    }
  }
  if (root && files.length > 0) throw new Error("Choose explicit files or --git-root, not both.");
  if (staged && !root) throw new Error("--staged requires --git-root.");
  if (!root && files.length === 0) throw new Error(usage);
  return { root, staged, json, files };
}

// Reads Git metadata or blobs without shell expansion or a small stdout truncation limit.
function git(root: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", root, ...args], { maxBuffer: Infinity });
}

// Uses NUL-separated paths; staged mode reads regular-file blobs from the index.
function gitFiles(root: string, staged: boolean): TextInput[] {
  if (!staged) {
    const output = git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
    return [...new Set(output.toString("utf8").split("\0").filter(Boolean))]
      .map((filename) => ({ filename: resolve(root, filename) }));
  }
  const selected = new Set(
    git(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
      .toString("utf8").split("\0").filter(Boolean),
  );
  const inputs: TextInput[] = [];
  for (const entry of git(root, ["ls-files", "--stage", "-z"]).toString("utf8").split("\0")) {
    if (!entry) continue;
    const separator = entry.indexOf("\t");
    const [mode, blob, stage] = entry.slice(0, separator).split(" ");
    const filename = entry.slice(separator + 1);
    if (stage === "0" && (mode === "100644" || mode === "100755") && selected.has(filename)) {
      inputs.push({ filename: resolve(root, filename), blob });
    }
  }
  return inputs;
}

// Skips repository binaries only in Git mode; explicit invalid text is an error.
function readText(filename: string, gitMode: boolean): string | undefined {
  let info;
  try {
    info = lstatSync(filename);
  } catch (error) {
    if (gitMode && error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (!info.isFile()) {
    if (gitMode) return;
    throw new Error(`Not a regular file: ${filename}`);
  }
  return decodeText(readFileSync(filename), filename, gitMode);
}

// Applies the same strict UTF-8/binary boundary to working files and index blobs.
function decodeText(bytes: Buffer, filename: string, gitMode: boolean): string | undefined {
  if (bytes.includes(0)) {
    if (gitMode) return;
    throw new Error(`Not UTF-8 text (NUL byte): ${filename}`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    if (gitMode) return;
    throw new Error(`Not valid UTF-8 text: ${filename}`);
  }
}

// Reports all findings and uses distinct exits for findings and input/tool failures.
function main(): void {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;
  if (options.root !== undefined) {
    options.root = resolve(git(options.root, ["rev-parse", "--show-toplevel"]).toString("utf8").trimEnd());
  }
  const inputs: TextInput[] = options.root
    ? gitFiles(options.root, options.staged)
    : options.files.map((file) => ({ filename: resolve(file) }));
  const results: Array<ReturnType<typeof scanText>[number] & { file: string }> = [];
  for (const input of inputs) {
    const source = input.blob !== undefined && options.root !== undefined
      ? decodeText(git(options.root, ["cat-file", "blob", input.blob]), input.filename, true)
      : readText(input.filename, options.root !== undefined);
    if (source === undefined) continue;
    const file = relative(options.root ?? process.cwd(), input.filename);
    for (const finding of scanText(source, input.filename)) results.push({ file, ...finding });
  }
  if (options.json) {
    console.log(JSON.stringify(results));
  } else {
    for (const result of results) {
      console.log(`${result.file}:${result.line}:${result.column}: ${result.rule}: ${result.message}`);
    }
  }
  process.exitCode = results.length > 0 ? 1 : 0;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
