// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi, isValidNoteName } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  isDivisionLabel,
  isPanLabel,
  parseLabel,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import { parseParamLines } from "./update-device-param-parser.ts";

const BINARY_SEARCH_ITERATIONS = 40;

/**
 * Set parameter values from name=value lines
 * @param device - LiveAPI device object to update
 * @param paramsInput - Multiline name=value string
 */
export function setParamValues(device: LiveAPI, paramsInput: string): void {
  const paramEntries = parseParamLines(paramsInput);

  for (const [key, inputValue] of paramEntries) {
    const param =
      resolveParamByName(device, key) ??
      (/^\d+$/.test(key) ? resolveParamForDevice(device, key) : null);

    if (!param?.exists()) {
      console.warn(`updateDevice: param "${key}" not found on device`);
      continue;
    }

    setParamValue(param, inputValue);
  }
}

/**
 * Resolve a param ID relative to a target device
 * @param device - LiveAPI device object
 * @param paramId - Param identifier (path ending in "parameters N", or absolute ID)
 * @returns LiveAPI param object or null
 */
function resolveParamForDevice(
  device: LiveAPI,
  paramId: string,
): LiveAPI | null {
  // If paramId ends with "parameters N", extract index and resolve relative to device
  // This enables multi-path param updates where the same param index is applied to each device
  const match = paramId.match(/parameters (\d+)$/);

  if (match) {
    return LiveAPI.from(`${device.path} parameters ${match[1]}`);
  }

  // Default: use absolute ID resolution (backward compatible for single-device updates)
  return LiveAPI.from(paramId);
}

/**
 * Resolve a parameter by name on a device (case-insensitive)
 * @param device - LiveAPI device object
 * @param name - Parameter name to find
 * @returns LiveAPI param object or null
 */
function resolveParamByName(device: LiveAPI, name: string): LiveAPI | null {
  const nameLower = name.toLowerCase();
  const parameters = device.getChildren("parameters");

  for (const param of parameters) {
    const paramName = param.getProperty("name") as string;

    if (paramName.toLowerCase() === nameLower) {
      return param;
    }

    // Also match formatted name "name (original_name)" for rack macros
    const originalName = param.getProperty("original_name") as string;

    if (originalName !== paramName) {
      const formatted = `${paramName} (${originalName})`;

      if (formatted.toLowerCase() === nameLower) {
        return param;
      }
    }
  }

  return null;
}

/**
 * Set a parameter value with type-appropriate handling
 * @param param - Parameter to set
 * @param inputValue - Value to set
 */
function setParamValue(param: LiveAPI, inputValue: string | number): void {
  const isQuantized = (param.getProperty("is_quantized") as number) > 0;

  // 1. Enum - string input with quantized param
  if (isQuantized && typeof inputValue === "string") {
    const valueItems = param.get("value_items") as string[];
    const index = valueItems.indexOf(inputValue);

    if (index === -1) {
      console.warn(
        `updateDevice: "${inputValue}" is not valid. Options: ${valueItems.join(", ")}`,
      );

      return;
    }

    param.set("value", index);

    return;
  }

  // 2. Note - string matching note pattern (e.g., "C4", "F#-1")
  if (typeof inputValue === "string" && isValidNoteName(inputValue)) {
    const midi = noteNameToMidi(inputValue);

    if (midi == null) {
      console.warn(`updateDevice: invalid note name "${inputValue}"`);

      return;
    }

    param.set("value", midi);

    return;
  }

  // 3. Pan - detect via current label, convert -1/1 to internal range
  const currentValue = param.getProperty("value");
  const currentLabel = param.call("str_for_value", currentValue) as string;

  if (isPanLabel(currentLabel)) {
    const min = param.getProperty("min") as number;
    const max = param.getProperty("max") as number;
    // Convert -1 to 1 → internal range
    const numValue = inputValue;
    const internalValue = ((numValue + 1) / 2) * (max - min) + min;

    param.set("value", internalValue);

    return;
  }

  // 4. Division params - string input matching fraction format (e.g., "1/8")
  const rawMin = param.getProperty("min") as number;
  const minLabel = param.call("str_for_value", rawMin) as string;

  if (isDivisionLabel(currentLabel) || isDivisionLabel(minLabel)) {
    const rawValue = findDivisionRawValue(param, inputValue);

    if (rawValue != null) {
      param.set("value", rawValue);
    } else {
      console.warn(
        `updateDevice: "${inputValue}" is not a valid division option`,
      );
    }

    return;
  }

  // 5. Numeric - convert display value to raw value
  if (typeof inputValue === "number") {
    const rawMax = param.getProperty("max") as number;
    const rawValue = findRawValueForDisplay(
      param,
      inputValue,
      rawMin,
      rawMax,
      minLabel,
    );

    param.set("value", rawValue ?? inputValue);

    return;
  }

  // 6. String fallback
  param.set("value", inputValue);
}

/**
 * Find the raw value for a division parameter by matching input to str_for_value
 * @param param - LiveAPI parameter object
 * @param inputValue - Target value (e.g., "1/8" or "1")
 * @returns Raw value or null if not found
 */
function findDivisionRawValue(
  param: LiveAPI,
  inputValue: string | number,
): number | null {
  const min = param.getProperty("min") as number;
  const max = param.getProperty("max") as number;
  const minInt = Math.ceil(Math.min(min, max));
  const maxInt = Math.floor(Math.max(min, max));
  const targetLabel =
    typeof inputValue === "number" ? String(inputValue) : inputValue;

  for (let i = minInt; i <= maxInt; i++) {
    const label = param.call("str_for_value", i);
    const labelStr = typeof label === "number" ? String(label) : label;

    if (labelStr === targetLabel) {
      return i;
    }
  }

  return null;
}

/**
 * Find the raw value that corresponds to a target display value.
 * Uses direct mapping for linear params (display range ≈ raw range),
 * binary search for non-linear params (e.g., exponential envelope times).
 * @param param - LiveAPI parameter object
 * @param targetDisplay - Target value in display units
 * @param rawMin - Raw minimum value
 * @param rawMax - Raw maximum value
 * @param minLabel - Already-computed str_for_value(rawMin)
 * @returns Raw value to set, or null if labels aren't parseable
 */
function findRawValueForDisplay(
  param: LiveAPI,
  targetDisplay: number,
  rawMin: number,
  rawMax: number,
  minLabel: string,
): number | null {
  const minParsed = parseLabel(minLabel);

  if (minParsed.value == null || typeof minParsed.value === "string") {
    return null;
  }

  const maxLabel = param.call("str_for_value", rawMax) as string;
  const maxParsed = parseLabel(maxLabel);

  if (maxParsed.value == null || typeof maxParsed.value === "string") {
    return null;
  }

  // Linear mapping: display values match raw values — set directly
  const range = Math.abs(rawMax - rawMin);
  const tolerance = range > 0 ? 0.01 * range : 0.01;

  if (
    Math.abs(minParsed.value - rawMin) < tolerance &&
    Math.abs(maxParsed.value - rawMax) < tolerance
  ) {
    return targetDisplay;
  }

  // Non-linear mapping: binary search
  return binarySearchRawValue(param, targetDisplay, rawMin, rawMax);
}

/**
 * Binary search the raw value range to find the value whose display matches the target.
 * @param param - LiveAPI parameter object
 * @param targetDisplay - Target display value
 * @param rawMin - Raw minimum
 * @param rawMax - Raw maximum
 * @returns Converged raw value
 */
function binarySearchRawValue(
  param: LiveAPI,
  targetDisplay: number,
  rawMin: number,
  rawMax: number,
): number {
  let lo = rawMin;
  let hi = rawMax;

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const label = param.call("str_for_value", mid) as string;
    const parsed = parseLabel(label);
    const displayValue = parsed.value;

    if (displayValue == null || typeof displayValue === "string") {
      return mid;
    }

    if (displayValue < targetDisplay) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}
