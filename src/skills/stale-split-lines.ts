// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * How long a line has to be before matching it verbatim means the override
 * copied it. Short enough for one bullet lead or a specific heading, long
 * enough that a generic `## Examples` can't trip it.
 */
const MIN_COPIED_LINE = 40;

/**
 * The substantial lines an override body and a `-write` sibling's built-in both
 * carry, word for word. A `-write` split keeps the head slot's name, so an
 * override made before it still resolves and still assembles — this overlap is
 * the only evidence that it holds the authoring half a second time.
 *
 * Headings alone were the wrong signal in both directions. Stark's authoring
 * half was a BULLET before the split, with no heading of its own, so a stale
 * fork of it could never be detected; meanwhile a fresh fork that writes its own
 * `## Examples` shares a heading with content it never copied, and was told to
 * delete its own text. A long line reproduced verbatim is what actually says
 * "this came from the built-in".
 *
 * @param body - The override body
 * @param siblingBuiltIn - The `-write` sibling's built-in fragment
 * @returns Shared lines, in the built-in's order
 */
export function staleSplitLines(
  body: string,
  siblingBuiltIn: string,
): string[] {
  const bodyLines = new Set(body.split("\n").map((line) => line.trim()));

  return siblingBuiltIn
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_COPIED_LINE && bodyLines.has(line));
}
