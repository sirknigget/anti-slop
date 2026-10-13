/*
 * Checks literal Unicode text without parsing a programming language.
 * Keeps ordinary emoji selectors, tagged flags and balanced bidi controls valid.
 */

export type TextRule = "unbalanced-bidi" | "hidden-unicode-tags" | "consecutive-variation-selectors";

export interface TextFinding {
  rule: TextRule;
  line: number;
  column: number;
  message: string;
}

// Recognizes the tag alphabet used by emoji tags and hidden ASCII payloads.
function isTag(codePoint: number): boolean {
  return codePoint >= 0xe0020 && codePoint <= 0xe007f;
}

// Recognizes both Unicode variation-selector ranges, including supplementary scalars.
function isVariationSelector(codePoint: number): boolean {
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

// Reports unclosed formatting and isolate controls independently on each line.
function checkBidi(line: string, lineNumber: number, findings: TextFinding[]): void {
  const formatting: number[] = [];
  const isolates: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charCodeAt(index);
    if (character === 0x202a || character === 0x202b || character === 0x202d || character === 0x202e) {
      formatting.push(index + 1);
    } else if (character === 0x2066 || character === 0x2067 || character === 0x2068) {
      isolates.push(index + 1);
    } else if (character === 0x202c) {
      formatting.pop();
    } else if (character === 0x2069) {
      isolates.pop();
    }
  }
  const formattingColumn = formatting.at(-1);
  const isolateColumn = isolates.at(-1);
  const column = formattingColumn === undefined
    ? isolateColumn
    : isolateColumn === undefined ? formattingColumn : Math.min(formattingColumn, isolateColumn);
  if (column !== undefined) {
    findings.push({
      rule: "unbalanced-bidi",
      line: lineNumber,
      column,
      message: "Unclosed bidirectional control can conceal the displayed meaning of this line.",
    });
  }
}

// Finds invisible tag runs while retaining the documented black-flag context exception.
function checkTags(line: string, lineNumber: number, findings: TextFinding[]): void {
  let offset = 0;
  while (offset < line.length) {
    const codePoint = line.codePointAt(offset)!;
    if (codePoint === 0x1f3f4) {
      offset += 2;
      while (offset < line.length && isTag(line.codePointAt(offset)!)) {
        const tag = line.codePointAt(offset)!;
        offset += 2;
        if (tag === 0xe007f) break;
      }
      continue;
    }
    if (!isTag(codePoint)) {
      offset += codePoint > 0xffff ? 2 : 1;
      continue;
    }
    const column = offset + 1;
    let count = 0;
    let hasNonSpace = false;
    while (offset < line.length && isTag(line.codePointAt(offset)!)) {
      hasNonSpace ||= line.codePointAt(offset) !== 0xe0020;
      count += 1;
      offset += 2;
    }
    if (count >= 2 && hasNonSpace) {
      findings.push({
        rule: "hidden-unicode-tags",
        line: lineNumber,
        column,
        message: `${count} consecutive Unicode tags encode hidden text outside a tagged flag.`,
      });
    }
  }
}

// A single selector is valid; consecutive selectors are the published hidden-payload contract.
function checkVariationSelectors(line: string, lineNumber: number, findings: TextFinding[]): void {
  let offset = 0;
  while (offset < line.length) {
    const codePoint = line.codePointAt(offset)!;
    if (!isVariationSelector(codePoint)) {
      offset += codePoint > 0xffff ? 2 : 1;
      continue;
    }
    const column = offset + 1;
    let count = 0;
    while (offset < line.length && isVariationSelector(line.codePointAt(offset)!)) {
      const selector = line.codePointAt(offset)!;
      count += 1;
      offset += selector > 0xffff ? 2 : 1;
    }
    if (count >= 2) {
      findings.push({
        rule: "consecutive-variation-selectors",
        line: lineNumber,
        column,
        message: `${count} consecutive Unicode variation selectors can encode a hidden payload.`,
      });
    }
  }
}

// Scans UTF-8-decoded content of any format; columns are one-based UTF-16 code units.
export function scanText(source: string, filename = ""): TextFinding[] {
  const findings: TextFinding[] = [];
  const androidLocalizedStrings = /(?:^|\/)res\/values-[a-zA-Z-]+\/strings\.xml$/.test(filename.replaceAll("\\", "/"));
  const lines = source.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!androidLocalizedStrings) checkBidi(line, index + 1, findings);
    checkTags(line, index + 1, findings);
    checkVariationSelectors(line, index + 1, findings);
  }
  return findings;
}
