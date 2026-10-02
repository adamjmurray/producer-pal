// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { roundDisplayValue } from "./rounding.ts";

/**
 * A value as the read tools publish it: a number, or the label Live answers
 * with when the value isn't one (a fader at the bottom reads "-inf").
 */
export type PublishedValue = number | string;

/**
 * What a read would publish for a raw property value.
 * @param raw - The property as Live answered with it
 * @param round - The resolution reads publish this kind of value at
 * @returns The published value, or undefined when nothing came back
 */
export function publishedReadBack(
  raw: unknown,
  round: (value: number) => number,
): PublishedValue | undefined {
  const published: unknown = roundDisplayValue(raw, round);

  return typeof published === "number" || typeof published === "string"
    ? published
    : undefined;
}

/**
 * Whether what came back is a different value from the one written. A write
 * reports only what didn't land as asked, so this is what decides that.
 *
 * Live keeps a 32-bit float, so -6.333333 reads back as -6.33 either way and is
 * the same value. A read-back that isn't a number can't be compared with one,
 * so it always counts as different.
 * @param requested - The value the call asked for
 * @param published - The read-back, as a read publishes it
 * @param round - The resolution reads publish at; omit where the read already
 *   publishes at the value's own precision
 * @returns True when the result should report the read-back
 */
export function differsAtPublishedResolution(
  requested: number,
  published: unknown,
  round: (value: number) => number = (value) => value,
): boolean {
  return typeof published !== "number" || round(published) !== round(requested);
}

/**
 * The detail an entry carries for the values it reports. Observational on
 * purpose: it holds whether Live clamped the value, snapped it to a step, or
 * ignored the write and left what was already there.
 * @param fields - The entry's own fields whose values aren't the ones sent
 * @returns The detail, or undefined when every value landed
 */
export function readBackDetail(fields: string[]): string | undefined {
  return fields.length === 0
    ? undefined
    : `${fields.join(", ")} read back as shown, not as sent`;
}
