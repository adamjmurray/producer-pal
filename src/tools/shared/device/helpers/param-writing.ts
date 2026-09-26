// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TargetNotes,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  type PublishedValue,
  publishedReadBack,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import { strForValue } from "./param-label-parsing.ts";

/** What a mixer write landed, read back off the object it was written to. */
export interface MixerApplied {
  gainDb?: PublishedValue;
  pan?: PublishedValue;
}

/**
 * What one step of a param write produced, or why it produced nothing. A step
 * that produced a value can still carry a detail: the value is there, but it is
 * not the one asked for (a clamp, the nearest step of a coarse ladder).
 */
export type ParamStep<T> = { value: T; detail?: string } | { reason: string };

/**
 * Whether a parameter accepts writes. Live disables a parameter when something
 * else owns it — almost always a rack macro mapped to it. Only a positive "no"
 * counts: an object that doesn't report `is_enabled` is treated as writable.
 * @param param - DeviceParameter LiveAPI object
 * @returns False only when Live reports the parameter as disabled
 */
export function isParamEnabled(param: LiveAPI): boolean {
  return param.getProperty("is_enabled") !== 0;
}

/**
 * Write a parameter and report what it now reads, the way a read publishes it.
 * Live clamps and snaps what it is given, so echoing the argument would report
 * a value the parameter doesn't hold.
 *
 * A disabled parameter is refused on the target's entry: Live accepts the
 * `set`, reports success, and ignores it.
 *
 * Max serializes some floats as strings (a pan of 0.0001 comes back as
 * "9.999999747378752e-05"), which publish as the number they spell; a volume at
 * the bottom of its range answers "-inf", which is no number at all and comes
 * back as the label a read would show.
 * @param param - DeviceParameter LiveAPI object
 * @param property - Which property carries the value
 * @param value - Value to write, or undefined to leave the parameter alone
 * @param field - The param the call sent it as
 * @param round - Rounds the read-back to the resolution reads report
 * @param notes - What the target's entry has to say, added to
 * @returns What the parameter now reads, or undefined when nothing was written
 */
export function setParamAndReadBack(
  param: LiveAPI,
  property: "value" | "display_value",
  value: number | undefined,
  field: string,
  round: (value: number) => number,
  notes: TargetNotes,
): PublishedValue | undefined {
  if (value == null) {
    return undefined;
  }

  if (!isParamEnabled(param)) {
    refuseTargetWork(notes, [field], `${field} ${PARAM_DISABLED_REASON}`);

    return undefined;
  }

  param.set(property, value);

  return publishedReadBack(param.getProperty(property), round);
}

/**
 * Write a raw value and check it landed, answering with the reason it didn't.
 * Live silently ignores a write it doesn't like — most often one outside the
 * parameter's raw range — leaving the old value in place and reporting success,
 * so without this the tool claims an update that never happened.
 *
 * Compares display labels, not raw numbers. Live does not keep the number we
 * send: it rounds to six significant digits and stores that as a 32-bit float,
 * and some parameters reporting a continuous range really hold only a few
 * steps — Glue Compressor's Attack snaps a raw 2.5 down to 2. The label
 * absorbs both.
 *
 * Ask Live to render the value we asked for, not a guess at what it stored.
 * Measured on 12.4.3: the label for the requested value matches the stored
 * one every time, while the label for `Math.fround(rawValue)` disagrees on a
 * display boundary — warning "was not changed" about a write that landed.
 * @param param - DeviceParameter LiveAPI object
 * @param rawValue - Raw value to write
 * @returns Why the value didn't land, or null when it did
 */
export function setParamValueAndVerify(
  param: LiveAPI,
  rawValue: number,
): string | null {
  const expected = strForValue(param, rawValue);

  param.set("value", rawValue);

  const actual = strForValue(param, param.getProperty("value") as number);

  return actual === expected
    ? null
    : `was not changed — it still reads "${actual}". Live ignores a value outside the parameter's range.`;
}

/** Why a write to a parameter something else owns lands nowhere. */
export const PARAM_DISABLED_REASON =
  "is disabled and was not changed — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.";
