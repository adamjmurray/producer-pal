// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Resolve a ±n offset beat the way the grammar does: base + (num/den)*denom.
 * Mirrors the float arithmetic so toStrictEqual matches bit-for-bit.
 * @param base - The integer beat the offset is applied to
 * @param num - Offset numerator (the n in ±n/den)
 * @param den - Offset denominator
 * @param denom - Whole-note-to-beat scale (defaults to 4, i.e. 4/4)
 * @returns The resolved beat value
 */
export const obeat = (
  base: number,
  num: number,
  den: number,
  denom = 4,
): number => base + (num / den) * denom;

/**
 * The original borrow: add a bar at a time until the beat reaches 1.
 * @param bar - Starting bar
 * @param beat - Raw beat, possibly below 1
 * @param beatsPerBar - Beats per bar
 * @returns The canonical bar and beat
 */
export function loopBorrow(
  bar: number,
  beat: number,
  beatsPerBar: number,
): { bar: number; beat: number } {
  while (beat < 1) {
    beat += beatsPerBar;
    bar -= 1;
  }

  return { bar, beat };
}
