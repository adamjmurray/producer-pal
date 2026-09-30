// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  fixParses as fixParsesWith,
  stripComments,
} from "#src/notation/peggy-error-formatter.ts";
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
 * @param fix - A transform statement
 * @returns Whether it parses
 */
export function fixParses(fix: string): boolean {
  return fixParsesWith(parse, fix);
}
