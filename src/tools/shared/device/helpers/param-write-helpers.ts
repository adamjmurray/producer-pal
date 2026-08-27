// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { strForValue } from "./device-label-helpers.ts";

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
 * Write a raw value and check it landed. Live silently ignores a write it
 * doesn't like — most often one outside the parameter's raw range — leaving the
 * old value in place and reporting success, so without this the tool claims an
 * update that never happened.
 *
 * Compares display labels, not raw numbers. Live stores the raw value as a
 * 32-bit float (Math.fround models that), and some parameters reporting a
 * continuous range really hold only a few steps — Glue Compressor's Attack
 * snaps a raw 2.5 down to 2 — so a raw readback differs from what we wrote even
 * when the write worked. The label absorbs both.
 * @param param - DeviceParameter LiveAPI object
 * @param rawValue - Raw value to write
 * @param label - How to name the parameter in the warning
 */
export function setParamValueAndVerify(
  param: LiveAPI,
  rawValue: number,
  label: string,
): void {
  const expected = strForValue(param, Math.fround(rawValue));

  param.set("value", rawValue);

  const actual = strForValue(param, param.getProperty("value") as number);

  if (actual === expected) return;

  console.warn(
    `${label} was not changed — it still reads "${actual}". Live ignores a value outside the parameter's range.`,
  );
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
