// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Opus 5.5 (Anthropic)
// SPDX-License-Identifier: MIT

import { parseNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { errorMessage } from "#src/shared/error-message.ts";

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

/**
 * @param notes - bar|beat text that must fail to parse
 * @returns The error message a model would read
 */
export function errorFor(notes: string): string {
  try {
    parseNotation(notes);
  } catch (error) {
    return errorMessage(error);
  }

  throw new Error(`"${notes}" parsed`);
}

/**
 * Run `check` over a sweep of `-n` offsets from beat 2.5 and meters, each with
 * the bar and beat the bar-at-a-time loop lands on.
 * @param maxDen - Largest offset denominator to try
 * @param check - Gets the point (like `3|2.5-n1/4`), beats per bar, and the
 * expected bar and beat
 */
export function sweepBorrows(
  maxDen: number,
  check: (
    point: string,
    beatsPerBar: number,
    expected: { bar: number; beat: number },
  ) => void,
): void {
  for (const bpb of [2, 3, 4, 5, 6, 7, 12]) {
    for (let den = 1; den <= maxDen; den++) {
      for (let num = 0; num <= 3 * den; num += Math.max(1, den >> 2)) {
        const bar = 1 + ((num + den) % 5);
        const raw = 2.5 - (num / den) * 4;

        check(`${bar}|2.5-n${num}/${den}`, bpb, loopBorrow(bar, raw, bpb));
      }
    }
  }
}
