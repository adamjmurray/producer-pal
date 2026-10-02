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
 * Tells whether a `#` is part of a note (a sharp) rather than a comment. Each
 * grammar passes its own: both grammars start a comment at any `#`, and a
 * sharp only counts where the grammar is reading a note.
 */
export type IsSharp = (text: string, index: number) => boolean;

/**
 * @param text - Notation text
 * @param position - Where to look
 * @param isSharp - The grammar's sharp rule
 * @param lastClose - Offset of the last block-comment closer in `text`, or -1.
 *   Scanners compute it once and pass it in: callers loop over every position,
 *   and rescanning for an unclosed opener each time would be quadratic.
 * @returns Where the comment starting at `position` ends, or null when none
 *   starts there. As in the grammars, `//` and `#` run to the end of the line,
 *   and a block comment that is never closed is not a comment.
 */
export function commentEnd(
  text: string,
  position: number,
  isSharp: IsSharp,
  lastClose: number,
): number | null {
  if (text.startsWith("/*", position)) {
    return lastClose < position + 2
      ? null
      : text.indexOf("*/", position + 2) + 2;
  }

  if (
    text.startsWith("//", position) ||
    (text[position] === "#" && !isSharp(text, position))
  ) {
    const lineEnd = /[\r\n]/g;

    lineEnd.lastIndex = position;

    return lineEnd.exec(text)?.index ?? text.length;
  }

  return null;
}

/**
 * Remove comments so their text can't trigger a hint. A block comment becomes
 * one space.
 * @param text - Notation text
 * @param isSharp - The grammar's sharp rule
 * @returns The text without comments
 */
export function stripComments(text: string, isSharp: IsSharp): string {
  const pieces: string[] = [];
  const lastClose = text.lastIndexOf("*/");
  let kept = 0;
  let position = 0;

  while (position < text.length) {
    const end = commentEnd(text, position, isSharp, lastClose);

    if (end == null) {
      position++;
      continue;
    }

    pieces.push(
      text.slice(kept, position),
      text.startsWith("/*", position) ? " " : "",
    );
    kept = end;
    position = end;
  }

  pieces.push(text.slice(kept));

  return pieces.join("");
}

/**
 * Hint for a `/*` that is never closed. The grammars don't read it as a
 * comment, so the parse fails at or after it and the text there looks like
 * code. A `/*` at the failure itself is skipped: the fault is what came
 * before it. Takes precedence over bracket hints, which would blame text that
 * was meant as comment.
 * @param failure - Where the parse stopped
 * @param isSharp - The grammar's sharp rule
 * @returns The hint, or null when no unclosed `/*` comes before the failure
 */
export function unclosedCommentHint(
  failure: SyntaxFailure,
  isSharp: IsSharp,
): string | null {
  const { source, offset } = failure;
  const lastClose = source.lastIndexOf("*/");
  let position = 0;

  while (position < offset && position < source.length) {
    const end = commentEnd(source, position, isSharp, lastClose);

    if (end != null) {
      position = end;
    } else if (source.startsWith("/*", position)) {
      return 'unclosed "/*" comment — add "*/".';
    } else {
      position++;
    }
  }

  return null;
}

/**
 * The failing line as the grammar reads it: comments removed (even ones that
 * start on an earlier line), with the failure's column moved to match.
 * @param failure - Where the parse stopped
 * @param isSharp - The grammar's sharp rule
 * @returns The comment-free line the failure is on, and the failure's column
 *   in it
 */
export function commentFreeLine(
  failure: SyntaxFailure,
  isSharp: IsSharp,
): { line: string; column: number } {
  const { source, offset } = failure;
  const code = stripComments(source, isSharp);
  const position = stripComments(source.slice(0, offset), isSharp).length;
  const lineStart =
    position === 0 ? 0 : code.lastIndexOf("\n", position - 1) + 1;
  const newline = code.indexOf("\n", position);
  const line = code
    .slice(lineStart, newline === -1 ? code.length : newline)
    .replace(/\r$/, "");

  return { line, column: position - lineStart };
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
