// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type PeggySyntaxError } from "./peggy-parser-types.ts";

const NEAR_MAX_LENGTH = 24;

/** One of Peggy's "expected" items. */
export type ExpectedItem = NonNullable<PeggySyntaxError["expected"]>[number];

/** Where a parse stopped, as the notation's own hints read it. */
export interface SyntaxFailure {
  /** The failing line's text */
  line: string;
  /** 0-based offset in the line where the parse stopped */
  column: number;
  /** What Peggy would have accepted there */
  expected: ExpectedItem[];
  /** The full text that failed to parse */
  source: string;
  /** 0-based offset in `source` where the parse stopped */
  offset: number;
}

/**
 * Format a Peggy parse failure: where it stopped, the text there, and a
 * notation-specific detail (the likely fix, or what was expected).
 * @param label - Message prefix, e.g. "bar|beat syntax error"
 * @param error - The Peggy SyntaxError
 * @param source - The full text that failed to parse
 * @param describe - Builds the detail from the failure
 * @returns The message
 */
export function formatSyntaxError(
  label: string,
  error: PeggySyntaxError,
  source: string,
  describe: (failure: SyntaxFailure) => string,
): string {
  const { offset, line, column } = error.location.start;
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const newline = source.indexOf("\n", offset);
  const lineText = source
    .slice(lineStart, newline === -1 ? source.length : newline)
    .replace(/\r$/, "");
  const lineColumn = offset - lineStart;

  const detail = describe({
    line: lineText,
    column: lineColumn,
    expected: error.expected ?? [],
    source,
    offset,
  });

  return `${label} at position ${offset} (line ${line}, column ${column}) ${near(lineText.slice(lineColumn), offset >= source.length)}: ${detail}`;
}

/**
 * Remove comments so their text can't trigger a hint. `#` only starts a
 * comment after whitespace — `C#3` is a pitch. Scans with indexOf, not a
 * regex, so a line of thousands of `/*` stays linear.
 * @param text - One line of notation
 * @returns The text without comments
 */
export function stripComments(text: string): string {
  const pieces: string[] = [];
  let position = 0;

  while (position < text.length) {
    const open = text.indexOf("/*", position);

    if (open === -1) {
      pieces.push(text.slice(position));
      break;
    }

    pieces.push(text.slice(position, open), " ");
    const close = text.indexOf("*/", open + 2);

    position = close === -1 ? text.length : close + 2;
  }

  let code = pieces.join("");
  const lineComment = code.indexOf("//");

  if (lineComment !== -1) {
    code = code.slice(0, lineComment);
  }

  const hash = /(?:^|\s)#/.exec(code);

  return hash == null ? code : code.slice(0, hash.index + hash[0].length - 1);
}

/**
 * @param text - Text to search
 * @param open - Opening bracket
 * @param close - Closing bracket
 * @returns Whether `text` has more `open` than `close`
 */
export function isUnclosed(text: string, open: string, close: string): boolean {
  return text.split(open).length > text.split(close).length;
}

/**
 * Hint for a note value with a zero denominator (`n/0`, `@n1/0`). Same text as
 * the grammars' own error for a duration value.
 * @param code - The failing line, comments removed
 * @returns The hint, or null when there is no such note value
 */
export function zeroDenominatorHint(code: string): string | null {
  // Not `clip.position/0`: the `n` must start a word.
  const token = /(?<![\w.])n[\d.]*\/0(?![\d.])/.exec(code)?.[0];

  return token == null
    ? null
    : `a note value's denominator can't be 0 (got ${token}): n/4 = quarter, n/8 = eighth, n/12 = eighth triplet.`;
}

/**
 * @param text - Text to read
 * @param end - What ends the word
 * @returns The text up to the first `end`
 */
export function firstWord(text: string, end: RegExp = /\s/): string {
  const stop = text.search(end);

  return stop === -1 ? text : text.slice(0, stop);
}

/**
 * @param text - Text from where a parse stopped
 * @returns Its first character after spaces and tabs, quoted — or named, when
 *   it is invisible or an unusual space — or null at the end of the line
 */
export function showNextChar(text: string): string | null {
  const char = /^[ \t]*([^ \t])/su.exec(text)?.[1];

  if (char == null || char === "\n" || char === "\r") {
    return null;
  }

  const code = `U+${(char.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`;

  if (/^\p{Zs}$/u.test(char)) {
    return `unusual space ${code}`;
  }

  return /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(char)
    ? `"${char}"`
    : `invisible character ${code}`;
}

/**
 * @param text - Text from where a parse stopped
 * @returns Hint to fix an unusual space or invisible character there, or null
 */
export function invisibleCharHint(text: string): string | null {
  const shown = showNextChar(text);

  if (shown?.startsWith("unusual space") === true) {
    return `replace the ${shown} with a normal space.`;
  }

  return shown?.startsWith("invisible") === true
    ? `remove the ${shown}.`
    : null;
}

/**
 * Levenshtein distance between two strings, for "did you mean" hints.
 * @param a - First string
 * @param b - Second string
 * @returns Number of single-character edits between them
 */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }

    previous = current;
  }

  return previous[b.length] as number;
}

/**
 * Whether a suggested fix really parses. A hint that names a wrong fix is
 * worse than none, so every "write …" hint checks here first.
 * @param parse - The notation's parser
 * @param fix - The suggested text
 * @returns Whether it parses
 */
export function fixParses(
  parse: (text: string) => unknown,
  fix: string,
): boolean {
  try {
    parse(fix);

    return true;
  } catch {
    return false;
  }
}

/**
 * @param rest - The failing line from the failure on
 * @param atEnd - Whether the failure is at the end of the whole input
 * @returns `near "<text>"`, or where the line or input ended
 */
function near(rest: string, atEnd: boolean): string {
  const text = rest.trimEnd();

  if (text === "") {
    return atEnd ? "at end of input" : "at end of line";
  }

  const shown =
    text.length > NEAR_MAX_LENGTH ? `${text.slice(0, NEAR_MAX_LENGTH)}…` : text;

  return `near "${shown}"`;
}
