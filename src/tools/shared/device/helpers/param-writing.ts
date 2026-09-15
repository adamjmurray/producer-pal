// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
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
 * that produced a value can still carry a reason: the value is there, but it is
 * not the one asked for (a clamp, the nearest step of a coarse ladder).
 */
export type ParamStep<T> = { value: T; reason?: string } | { reason: string };

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
 * Write to a parameter unless it's disabled. Live accepts a `set` on a disabled
 * parameter, reports success, and ignores it, so without this check the tool
 * tells the user a write landed when it did not.
 * @param param - DeviceParameter LiveAPI object
 * @param property - Which property carries the value
 * @param value - Value to write
 * @param label - How to name the parameter in the warning
 * @returns True when the value was written
 */
export function setParamIfEnabled(
  param: LiveAPI,
  property: "value" | "display_value",
  value: number,
  label: string,
): boolean {
  if (!isParamEnabled(param)) {
    warnParamDisabled(label);

    return false;
  }

  param.set(property, value);

  return true;
}

/**
 * Write a parameter and report what it now reads, the way a read publishes it.
 * Live clamps and snaps what it is given, so echoing the argument would report
 * a value the parameter doesn't hold.
 *
 * Max serializes some floats as strings (a pan of 0.0001 comes back as
 * "9.999999747378752e-05"), which publish as the number they spell; a volume at
 * the bottom of its range answers "-inf", which is no number at all and comes
 * back as the label a read would show.
 * @param param - DeviceParameter LiveAPI object
 * @param property - Which property carries the value
 * @param value - Value to write, or undefined to leave the parameter alone
 * @param label - How to name the parameter in a warning
 * @param round - Rounds the read-back to the resolution reads report
 * @returns What the parameter now reads, or undefined when nothing was written
 */
export function setParamAndReadBack(
  param: LiveAPI,
  property: "value" | "display_value",
  value: number | undefined,
  label: string,
  round: (value: number) => number,
): PublishedValue | undefined {
  if (value == null || !setParamIfEnabled(param, property, value, label)) {
    return undefined;
  }

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

/**
 * Warn that a disabled parameter was skipped. For a chain's own mixer, which
 * still announces it this way; a track's mixer and sends carry the reason on
 * their own entry instead, since silence there means the value landed.
 * @param label - How to name the parameter in the warning
 */
export function warnParamDisabled(label: string): void {
  console.warn(`${label} ${PARAM_DISABLED_REASON}`);
}
