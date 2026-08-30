// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  parseLabel,
  unitForLabels,
} from "#src/tools/shared/device/helpers/device-label-helpers.ts";

/**
 * Whether a written value's unit is the one the parameter actually uses.
 *
 * The unit was being parsed off the value and then dropped, so only the number
 * survived: "50 dB" on a 0-100% param wrote 50% and reported success. Worse,
 * parseLabel folds s into ms, so "0.5 s" reached a unitless parameter whose
 * range is 0.1-1.2 (Glue Compressor's Release) as 500 — out of range, clamped
 * to the maximum, and warned about as if 0.5 had been invalid.
 *
 * Matching is by quantity, not spelling: s and ms are one unit here, as are Hz
 * and kHz, so either spelling still lands. A parameter Live displays without a
 * unit can't be checked at all — nothing reports what it measures — so a value
 * carrying one is refused rather than guessed at. A value with no unit is always
 * allowed — it's the documented way to write one, and the only way to write a
 * parameter that displays a bare number.
 * @param rawValue - The value as the caller wrote it, unit and all
 * @param currentLabel - The parameter's current display label
 * @param minLabel - The parameter's minimum display label
 * @param maxLabel - The parameter's maximum display label
 * @param label - How to name the parameter in a warning
 * @returns True when the write should go ahead
 */
export function unitMatches(
  rawValue: string,
  currentLabel: string,
  minLabel: string,
  maxLabel: string,
  label: string,
): boolean {
  const requested = parseLabel(rawValue).unit;

  if (requested == null) return true;

  const actual = unitForLabels(currentLabel, minLabel, maxLabel);

  if (requested === actual) return true;

  console.warn(
    actual == null
      ? `${label} displays a plain number from ${minLabel} to ${maxLabel} and never says what it measures, so "${rawValue}" was not written — send the number on its own.`
      : `${label} is measured in ${actual}, so "${rawValue}" was not written — send the value in ${actual}.`,
  );

  return false;
}
