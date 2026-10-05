// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The transform sharp rule. The grammar starts a comment at any `#`, even
 * right after a number or operator (`5#(c`, `5 +#c`), unless a pitch is being
 * read: a note letter that starts a word takes the `#` as its sharp (`C#3`,
 * `pitch = f#-1`). A letter ending a longer word or property (`abc#`,
 * `note.c#`) is not a pitch.
 * @param text - Transform text
 * @param index - Where the `#` is
 * @returns Whether it is a sharp, not a comment
 */
export function isTransformSharp(text: string, index: number): boolean {
  return (
    /[A-Ga-g]/.test(text[index - 1] ?? "") &&
    !/[\w.]/.test(text[index - 2] ?? "")
  );
}
