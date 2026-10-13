import assert from "node:assert/strict";
import { test } from "node:test";
import { scanText } from "./scan.ts";

const tags = (...points: number[]) => String.fromCodePoint(...points);
const hiddenTags = tags(0xe0061, 0xe0062);
const flag = tags(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);

// Checks literal content, not programming-language escape spellings or AST shape.
test("scans any text format and preserves ordinary Unicode", () => {
  for (const filename of ["source.ts", "styles.css", "page.html", "script.py", "README.md", "Dockerfile", ".env"]) {
    assert.deepEqual(scanText("שלום العربية ☀️ " + flag, filename), []);
    assert.equal(scanText("not valid syntax " + hiddenTags, filename)[0]?.rule, "hidden-unicode-tags");
  }
  assert.deepEqual(scanText(String.raw`\u202E \u{E0061}\u{E0062} \uFE0F\uFE0F`), []);
});

// Exercises the two independent per-line bidi stacks and their exact path exception.
test("reports only unclosed bidi formatting or isolates on each line", () => {
  for (const opener of [0x202a, 0x202b, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068]) {
    assert.equal(scanText(`x${tags(opener)}`)[0]?.rule, "unbalanced-bidi");
  }
  assert.deepEqual(scanText(tags(0x202e) + "text" + tags(0x202c)), []);
  assert.deepEqual(scanText(tags(0x2067) + "text" + tags(0x2069)), []);
  assert.deepEqual(scanText(tags(0x202e, 0x2067, 0x202c, 0x2069)), []);
  assert.deepEqual(scanText(tags(0x202c, 0x2069, 0x061c, 0x200e, 0x200f)), []);
  assert.equal(scanText(tags(0x202e, 0x2069))[0]?.rule, "unbalanced-bidi");
  assert.equal(scanText(tags(0x2067, 0x202c))[0]?.rule, "unbalanced-bidi");
  assert.equal(scanText(tags(0x202e) + "\n" + tags(0x202c)).length, 1);
  assert.deepEqual(scanText(tags(0x202e), "app/res/values-en-rUS/strings.xml"), []);
  assert.deepEqual(scanText(tags(0x202e), "app\\res\\values-en\\strings.xml"), []);
  for (const filename of ["res/values/strings.xml", "values-en/strings.xml", "res/values-en/other.xml", "res/values-en_XX/strings.xml"]) {
    assert.equal(scanText(tags(0x202e), filename).length, 1);
  }
  assert.equal(scanText(hiddenTags, "app/res/values-en/strings.xml")[0]?.rule, "hidden-unicode-tags");
});

// Keeps the documented flag-context exception without inventing country-code validation.
test("checks nonblank tag runs outside the black-flag context", () => {
  assert.equal(scanText(hiddenTags)[0]?.rule, "hidden-unicode-tags");
  assert.deepEqual(scanText(tags(0xe0061)), []);
  assert.deepEqual(scanText(tags(0xe0020, 0xe0020)), []);
  assert.deepEqual(scanText(tags(0xe0001)), []);
  assert.deepEqual(scanText(flag), []);
  assert.deepEqual(scanText(tags(0x1f3f4, 0xe0061, 0xe0062)), []);
  assert.equal(scanText(flag + hiddenTags).length, 1);
  assert.equal(scanText(tags(0x1f3f4, 0xe0061) + "x" + hiddenTags).length, 1);
  assert.equal(scanText(tags(0xe007f, 0xe0061)).length, 1);
  assert.deepEqual(scanText(tags(0xe0061) + "\n" + tags(0xe0062)), []);
});

// Uses the published two-selector contract, not the captured analyzer's four-selector threshold.
test("allows one selector and rejects two, three and four consecutive selectors", () => {
  for (const selector of [0xfe00, 0xfe0f, 0xe0100, 0xe01ef]) {
    assert.deepEqual(scanText("x" + tags(selector)), []);
    for (const count of [2, 3, 4]) {
      assert.equal(scanText("x" + tags(...Array<number>(count).fill(selector)))[0]?.rule, "consecutive-variation-selectors");
    }
  }
  assert.equal(scanText(tags(0xfe0f, 0xe0100))[0]?.rule, "consecutive-variation-selectors");
  assert.deepEqual(scanText(tags(0xfe0f) + "x" + tags(0xfe0f)), []);
  assert.deepEqual(scanText(tags(0xfe0f) + "\n" + tags(0xfe0f)), []);
});

// Makes UTF-16 columns and all common line endings explicit for caller diagnostics.
test("reports one-based lines and UTF-16 columns without requiring a final newline", () => {
  for (const newline of ["\n", "\r", "\r\n"]) {
    const findings = scanText("clean" + newline + "😀" + hiddenTags);
    assert.equal(findings[0]?.line, 2);
    assert.equal(findings[0]?.column, 3);
  }
  assert.equal(scanText("😀" + tags(0x202e))[0]?.column, 3);
  assert.equal(scanText("😀" + tags(0xfe0f, 0xfe0f))[0]?.column, 3);
  assert.deepEqual(scanText(""), []);
  assert.deepEqual(scanText("\r\n"), []);
  assert.equal(scanText(hiddenTags + " x " + hiddenTags).length, 2);
  assert.equal(scanText(tags(0x202e) + hiddenTags + tags(0xfe0f, 0xfe0f)).length, 3);
});
