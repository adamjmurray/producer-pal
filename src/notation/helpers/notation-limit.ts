// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Most notes one notation string may make, and most times one repeat or bar
 * range may run. Past it the string is refused: a huge count stalls the device.
 */
export const NOTATION_LIMIT = 10_000;

/**
 * Refuse a notation count over {@link NOTATION_LIMIT}.
 * @param count - How many notes, repeats or bars
 * @param subject - What is counted, as the error names it (`Repeat x20000`)
 */
export function checkNotationLimit(count: number, subject: string): void {
  if (count > NOTATION_LIMIT) {
    throw new Error(`${subject} is over the limit of ${NOTATION_LIMIT}`);
  }
}
