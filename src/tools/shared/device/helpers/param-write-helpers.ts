// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { strForValue } from "./device-label-helpers.ts";

/** What a mixer write landed, read back off the object it was written to. */
export interface MixerApplied {
  gainDb?: number;
  pan?: number;
}

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
 * Write a parameter and report what it now reads. Live clamps and snaps what it
 * is given, so echoing the argument would report a value the parameter doesn't
 * hold.
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
): number | undefined {
  if (value == null || !setParamIfEnabled(param, property, value, label)) {
    return undefined;
  }

  const landed = param.getProperty(property);

  // Max hands some floats back as strings (a pan of 0.0001 comes back as
  // "9.999999747378752e-05"), and omitting a value that landed would read as
  // "no write", so the argument stands in — rounded, like a real read-back.
  // It is a stand-in, not a reading: where the property answers with something
  // else entirely (a volume at the bottom of its range reads "-inf"), the
  // number reported is not what the parameter holds.
  return round(typeof landed === "number" ? landed : value);
}

/**
 * Write a raw value and check it landed. Live silently ignores a write it
 * doesn't like — most often one outside the parameter's raw range — leaving the
 * old value in place and reporting success, so without this the tool claims an
 * update that never happened.
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
 * @param label - How to name the parameter in the warning
 * @returns True when the value landed
 */
export function setParamValueAndVerify(
  param: LiveAPI,
  rawValue: number,
  label: string,
): boolean {
  const expected = strForValue(param, rawValue);

  param.set("value", rawValue);

  const actual = strForValue(param, param.getProperty("value") as number);

  if (actual === expected) return true;

  console.warn(
    `${label} was not changed — it still reads "${actual}". Live ignores a value outside the parameter's range.`,
  );

  return false;
}

/**
 * Warn that a disabled parameter was skipped
 * @param label - How to name the parameter in the warning
 */
export function warnParamDisabled(label: string): void {
  console.warn(
    `${label} is disabled and was not changed — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.`,
  );
}
