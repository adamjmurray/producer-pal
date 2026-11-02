// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A rack always has 16 macro params, however many it shows. The ones beyond
// `visible_macro_count` that nothing maps to are noise in a read.

/**
 * The macro number a param name carries: "Macro 9", or "Drive (Macro 9)" for a
 * renamed macro.
 * @param name - A param name as a read reports it
 * @returns The 1-based macro number, or undefined for any other param
 */
export function macroNumber(name: string): number | undefined {
  const match = /(?:^|\()Macro (\d+)\)?$/.exec(name);

  return match == null ? undefined : Number(match[1]);
}

/**
 * Whether a param is a macro the rack doesn't show and nothing maps to.
 * @param name - A param name as a read reports it
 * @param visibleCount - How many macros the rack shows
 * @param keep - Hidden macros that are mapped, by number
 * @returns True for a hidden macro to leave out of a read
 */
export function isUnusedHiddenMacro(
  name: string,
  visibleCount: number,
  keep: number[] = [],
): boolean {
  const number = macroNumber(name);

  return number != null && number > visibleCount && !keep.includes(number);
}
