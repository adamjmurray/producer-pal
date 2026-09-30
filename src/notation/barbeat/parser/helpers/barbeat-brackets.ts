// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
  let position = 0;

  while (position < source.length) {
    const char = source[position] as string;
    const skipTo = commentEnd(source, position);

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

/**
 * @param source - bar|beat text
 * @param position - Where to look
 * @returns Where the comment starting there ends, or null when none starts
 *   there. As in the grammar, `#` starts a comment anywhere whitespace may go,
 *   so even right after an item (`E3#`) — unless it is a sharp.
 */
function commentEnd(source: string, position: number): number | null {
  const two = source.slice(position, position + 2);

  const lineEnd = (): number => {
    const newline = source.indexOf("\n", position);

    return newline === -1 ? source.length : newline;
  };

  if (two === "//") {
    return lineEnd();
  }

  if (two === "/*") {
    const close = source.indexOf("*/", position + 2);

    return close === -1 ? source.length : close + 2;
  }

  if (source[position] === "#" && !isSharp(source, position)) {
    return lineEnd();
  }

  return null;
}

/**
 * A `#` is a sharp when it follows a note letter that starts a pitch: at the
 * start, after whitespace, `[`, `(` or a block comment (`C#3`, `[F#2`).
 * @param source - bar|beat text
 * @param position - Where the `#` is
 * @returns Whether it is a sharp, not a comment
 */
function isSharp(source: string, position: number): boolean {
  if (!/[A-Ga-g]/.test(source[position - 1] ?? "")) {
    return false;
  }

  const before = source.slice(Math.max(position - 3, 0), position - 1);

  return before === "" || /(?:[\s[(]|\*\/)$/.test(before);
}
