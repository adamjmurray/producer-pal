// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

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
 * Warn that a disabled parameter was skipped
 * @param label - How to name the parameter in the warning
 */
export function warnParamDisabled(label: string): void {
  console.warn(
    `${label} is disabled and was not changed — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.`,
  );
}
