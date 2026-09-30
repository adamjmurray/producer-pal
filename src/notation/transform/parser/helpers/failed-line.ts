// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from "../transform-parser.ts";

/** A transform line that failed to parse, split where the parse stopped. */
export interface FailedLine {
  /** The whole line, comments removed */
  code: string;
  /** The line up to where the parse failed */
  before: string;
  /** The line from where the parse failed, comments removed and trimmed */
  rest: string;
}

/**
 * Split a failing line at the failure, with comments removed.
 * @param line - The failing line's text
 * @param column - 0-based offset in the line where the parse failed
 * @returns The line's parts
 */
export function readFailedLine(line: string, column: number): FailedLine {
  return {
    code: stripComments(line),
    before: line.slice(0, column),
    rest: stripComments(line.slice(column)).trim(),
  };
}

/**
 * Whether a suggested fix really parses. A hint that names a wrong fix is
 * worse than none, so every "write …" hint checks here first.
 * @param fix - A transform statement
 * @returns Whether it parses
 */
export function fixParses(fix: string): boolean {
  try {
    parse(fix);

    return true;
  } catch {
    return false;
  }
}

/**
 * Remove comments so their text can't trigger a hint. `#` only starts a
 * comment after whitespace — `C#3` is a pitch. Scans with indexOf, not a
 * regex, so a line of thousands of `/*` stays linear.
 * @param text - Transform text
 * @returns The text without comments
 */
function stripComments(text: string): string {
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
