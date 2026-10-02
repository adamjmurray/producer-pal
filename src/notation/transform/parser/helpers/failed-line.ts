// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  commentFreeLine,
  fixParses as fixParsesWith,
  type SyntaxFailure,
} from "#src/notation/peggy-error-formatter.ts";
import { parse } from "../transform-parser.ts";
import { isTransformSharp } from "./transform-comments.ts";

/** A transform line that failed to parse, split where the parse stopped. */
export interface FailedLine {
  /** The whole line, comments removed */
  code: string;
  /** The line up to where the parse failed, comments removed */
  before: string;
  /** The line from where the parse failed, comments removed and trimmed */
  rest: string;
}

/**
 * Split a failing line at the failure, with comments removed.
 * @param failure - Where the parse stopped
 * @returns The line's parts
 */
export function readFailedLine(failure: SyntaxFailure): FailedLine {
  const { line: code, column } = commentFreeLine(failure, isTransformSharp);

  return {
    code,
    before: code.slice(0, column),
    rest: code.slice(column).trim(),
  };
}

/**
 * @param fix - A transform statement
 * @returns Whether it parses
 */
export function fixParses(fix: string): boolean {
  return fixParsesWith(parse, fix);
}
