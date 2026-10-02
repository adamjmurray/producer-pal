// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { commentEnd } from "#src/notation/peggy-error-formatter.ts";
import { isBarbeatSharp } from "./barbeat-comments.ts";

/** A `[` or `(` that is never closed. */
export interface UnmatchedBracket {
  bracket: "[" | "(";
  /** 0-based offset in the source */
  offset: number;
}

const CLOSERS: Record<string, "[" | "("> = { "]": "[", ")": "(" };

/**
 * Find the first `[` or `(` in bar|beat text that is never closed. Brackets
 * may span lines, as in the grammar, and brackets in comments don't count.
 * @param source - bar|beat text
 * @returns The first unclosed bracket, or null
 */
export function unmatchedBracket(source: string): UnmatchedBracket | null {
  const open: Record<"[" | "(", number[]> = { "[": [], "(": [] };
  const lastClose = source.lastIndexOf("*/");
  let position = 0;

  while (position < source.length) {
    const char = source[position] as string;
    const skipTo = commentEnd(source, position, isBarbeatSharp, lastClose);

    if (skipTo != null) {
      position = skipTo;
      continue;
    }

    if (char === "[" || char === "(") {
      open[char].push(position);
    } else if (char in CLOSERS) {
      open[CLOSERS[char] as "[" | "("].pop();
    }

    position++;
  }

  const first = [
    { bracket: "[" as const, offset: open["["][0] },
    { bracket: "(" as const, offset: open["("][0] },
  ]
    .filter((item): item is UnmatchedBracket => item.offset != null)
    .toSorted((a, b) => a.offset - b.offset);

  return first[0] ?? null;
}
