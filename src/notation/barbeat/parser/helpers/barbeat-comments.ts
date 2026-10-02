// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * bar|beat's sharp rule. The grammar starts a comment at any `#`, even right
 * after an item (`E3#`), unless a pitch is being read: a note letter at the
 * start of an item (the start, after whitespace, `[`, `(` or a block comment)
 * takes the `#` as its sharp (`C#3`, `[F#2`).
 * @param text - bar|beat text
 * @param index - Where the `#` is
 * @returns Whether it is a sharp, not a comment
 */
export function isBarbeatSharp(text: string, index: number): boolean {
  if (!/[A-Ga-g]/.test(text[index - 1] ?? "")) {
    return false;
  }

  const before = text.slice(Math.max(index - 3, 0), index - 1);

  return before === "" || /(?:[\s[(]|\*\/)$/.test(before);
}
