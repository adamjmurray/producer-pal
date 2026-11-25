// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { durationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";

// No meter has a bar this long, so a length empty at this size is empty in
// every meter. Bar sizes aren't capped (`150/1` parses).
const ANY_BEATS_PER_BAR = Number.MAX_SAFE_INTEGER;

/**
 * Refuse a clip length that spans nothing. Live makes a broken clip from a zero
 * length, or keeps the region it had.
 * @param length - The length as the caller wrote it
 * @param lengthBeats - What it comes to in the clip's meter
 * @param param - The parameter the length came from, named in the refusal
 * @throws Error when the length is zero or less
 */
export function refuseEmptyLength(
  length: string,
  lengthBeats: number,
  param = "length",
): void {
  if (lengthBeats <= 0) {
    throw new Error(`${param} "${length}" must be longer than zero`);
  }
}

/**
 * Refuse a clip length that spans nothing in every meter. A bar only grows with
 * the meter, so a length empty in the widest one is empty in all. One empty in
 * only some meters (`1bar-n/1` in 4/4) isn't refused here: check it per clip, in
 * the clip's own meter.
 * @param length - The length as the caller wrote it
 * @throws Error when the length is zero or less in every meter, or won't parse
 */
export function refuseEmptyInEveryMeter(length: string): void {
  refuseEmptyLength(
    length,
    durationToAbletonBeats(length, ANY_BEATS_PER_BAR, 4),
  );
}
