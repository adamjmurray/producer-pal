// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type FailedLine } from "./failed-line.ts";

// Hints for call arguments. The keywords take part only at the end of
// certain calls, and elsewhere the grammar just says "expected expression".
const SYNC_CALLS = ["sin", "cos", "saw", "tri", "square", "split"];
const RAW_CALLS = ["swing"];

/**
 * @param line - The failing line
 * @returns Hint for `sync` or `raw` where the call doesn't take it
 *   (`seq(1, 2, sync)`), or a trailing comma in such a call (`seq(1, 2, )`)
 */
export function misplacedKeywordMistake(line: FailedLine): string | null {
  const { before, rest } = line;
  const call = enclosingCall(before);
  const keyword = /^(?:sync|raw)(?![\w.])/.exec(rest)?.[0];

  if (keyword != null) {
    const allowed = keyword === "sync" ? SYNC_CALLS : RAW_CALLS;

    if (call != null && allowed.includes(call)) {
      return null;
    }

    const rule = `"${keyword}" ${keywordRule(keyword)}`;

    return call == null ? `${rule}.` : `${rule}; ${call}() doesn't take it.`;
  }

  // The waveform and swing calls already list their keyword as expected.
  const takesKeyword = [...SYNC_CALLS, ...RAW_CALLS];

  return call != null &&
    !takesKeyword.includes(call) &&
    rest.startsWith(")") &&
    before.trimEnd().endsWith(",")
    ? `nothing after the comma in ${call}() — add an argument or remove the comma. A final "sync" is for sin, cos, saw, tri, square and split; "raw" is for swing.`
    : null;
}

/**
 * @param keyword - `sync` or `raw`
 * @returns Where the keyword is allowed, with an example
 */
function keywordRule(keyword: string): string {
  return keyword === "sync"
    ? "goes last in sin(), cos(), saw(), tri(), square() or split(), e.g. sin(n/4, sync)"
    : "goes last in swing(), e.g. swing(0.05, raw)";
}

/**
 * @param before - The line up to where the parse stopped
 * @returns The name of the call the parse stopped inside, or null
 */
function enclosingCall(before: string): string | null {
  const opens: number[] = [];

  for (let i = 0; i < before.length; i++) {
    if (before[i] === "(") {
      opens.push(i);
    } else if (before[i] === ")") {
      opens.pop();
    }
  }

  const open = opens.pop();

  return open == null
    ? null
    : (/([A-Za-z]\w*)\s*$/.exec(before.slice(0, open))?.[1] ?? null);
}
