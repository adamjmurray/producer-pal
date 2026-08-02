// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Read a Max atom as a string. Message args and Live API `get()`/`call()`
 * results are typed `unknown` but only ever carry strings and numbers, so
 * anything else means our types are wrong — it reads as empty rather than
 * silently becoming "[object Object]".
 * @param atom - A Max message arg or Live API result element
 * @returns The atom's text, or "" if it isn't an atom
 */
export function atomToString(atom: unknown): string {
  return typeof atom === "string" || typeof atom === "number"
    ? String(atom)
    : "";
}

/**
 * Read a Max textedit param as a string.
 * @param atom - The value Max handed the handler
 * @returns The param's text
 */
export function textEditParamToString(atom: unknown): string {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  return atom === "bang" ? "" : atomToString(atom);
}
