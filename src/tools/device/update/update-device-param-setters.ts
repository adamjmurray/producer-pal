// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { noteNameToMidi, isValidNoteName } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  extractMaxPanValue,
  isDivisionLabel,
  isPanLabel,
  normalizePan,
  parseLabel,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import { resolveNestedParamTarget } from "#src/tools/shared/device/helpers/nested-param-target.ts";
import { applySpecializedParamWrite } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { normalizeParamValue } from "./update-device-param-parser.ts";

const BINARY_SEARCH_ITERATIONS = 40;

/**
 * Set parameter values from an array of {name, value} entries. Specialized-device
 * pseudo-params (e.g. `sample` for Simpler, `routingMode` for Roar) are
 * dispatched via the specialized-device registry before falling through to
 * DeviceParameter resolution. Entries with an empty name or value are skipped.
 * @param device - LiveAPI device object to update
 * @param params - Array of {name, value} param entries
 * @param toolName - Calling tool name for warning prefix (defaults to "updateDevice")
 */
export function setParamValues(
  device: LiveAPI,
  params: ParamEntry[],
  toolName: string = "updateDevice",
): void {
  for (const entry of params) {
    const key = entry.name.trim();
    const rawValue = entry.value.trim();

    if (key === "") {
      console.warn(`${toolName}: skipping param with empty name`);
      continue;
    }

    if (rawValue === "") {
      console.warn(`${toolName}: skipping param "${key}" with empty value`);
      continue;
    }

    // Isolate each param: a throw resolving one (e.g. a path-prefixed pad param
    // whose chain auto-create exceeds the cap) must not abort the rest of a
    // multi-param update. Warn and move on, consistent with update tools'
    // warn-and-skip contract.
    try {
      setOneParam(device, key, rawValue, toolName);
    } catch (e) {
      console.warn(
        `${toolName}: failed to set param "${key}": ${errorMessage(e)}`,
      );
    }
  }
}

/**
 * Resolve and set a single param entry (path-prefixed pseudo-param, specialized
 * pseudo-param, or DeviceParameter by name/index). Separated from the loop so
 * each entry can be try-isolated. Key and value are already trimmed and non-empty.
 * @param device - LiveAPI device object to update
 * @param key - Trimmed param name (may be a "/"-path or a slash-named param)
 * @param rawValue - Trimmed value
 * @param toolName - Calling tool name for warning prefix
 */
function setOneParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  toolName: string,
): void {
  // A name containing "/" is normally a path-prefixed pseudo-param
  // (e.g. "pC1/d0/sample"): resolve the prefix relative to this device, then
  // write the trailing param to the target. But some real DeviceParameters
  // have a "/" in their name (e.g. "Dry/Wet" on Reverb/Delay/Glue Compressor),
  // so prefer an exact param-name match first and only fall back to
  // path-routing when no such param exists — keeping slash-named params
  // settable by name.
  if (key.includes("/")) {
    const namedParam = resolveParamByName(device, key);

    if (namedParam?.exists()) {
      setParamValue(namedParam, normalizeParamValue(rawValue), toolName);
    } else {
      applyNestedParam(device, key, rawValue, toolName);
    }

    return;
  }

  const inputValue = normalizeParamValue(rawValue);

  if (applySpecializedParamWrite(device, key, inputValue, toolName)) {
    return;
  }

  // A purely numeric key is an absolute Live API param id.
  const param =
    resolveParamByName(device, key) ??
    (/^\d+$/.test(key) ? LiveAPI.from(key) : null);

  if (!param?.exists()) {
    console.warn(`${toolName}: param "${key}" not found on device`);

    return;
  }

  setParamValue(param, inputValue, toolName);
}

/**
 * Apply a path-prefixed pseudo-param. The prefix (everything before the last
 * "/") resolves to a target device relative to `device`; the trailing segment is
 * the param name, written via a single-entry recursion through setParamValues so
 * all value interpretation (enum, note, numeric, specialized pseudo-params) is
 * reused.
 * @param device - The device the path prefix is relative to (e.g. a Drum Rack)
 * @param key - Full path-prefixed param name (e.g. "pC1/d0/sample")
 * @param rawValue - Trimmed value to write
 * @param toolName - Calling tool name for warning prefix
 */
function applyNestedParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  toolName: string,
): void {
  const slashIndex = key.lastIndexOf("/");
  const prefix = key.slice(0, slashIndex);
  const paramName = key.slice(slashIndex + 1).trim();

  if (paramName === "") {
    console.warn(
      `${toolName}: skipping param "${key}" with empty name after "/"`,
    );

    return;
  }

  const target = resolveNestedParamTarget(device, prefix, paramName, toolName);

  if (target) {
    setParamValues(target, [{ name: paramName, value: rawValue }], toolName);
  }
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
 * @param toolName - Calling tool name for warning prefix
 */
function setParamValue(
  param: LiveAPI,
  inputValue: string | number,
  toolName: string,
): void {
  const isQuantized = (param.getProperty("is_quantized") as number) > 0;

  // 1. Enum - quantized param. Resolve the input against value_items by string.
  // normalizeParamValue turns a numeric-looking label (e.g. "4" on a
  // "1"/"2"/"4"/"8" or synced note-value selector) into a number, so match
  // String(inputValue): otherwise a numeric label skips enum dispatch and falls
  // into the numeric binary-search branch, writing a garbage raw value
  // (e.g. 2.9999… instead of index 2). Quantized params are discrete enums with
  // no continuous range to search, so numeric input is always a label lookup.
  if (isQuantized) {
    const valueItems = param.get("value_items") as string[];
    const index = valueItems.indexOf(String(inputValue));

    if (index === -1) {
      console.warn(
        `${toolName}: "${inputValue}" is not valid. Options: ${valueItems.join(", ")}`,
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
      console.warn(`${toolName}: invalid note name "${inputValue}"`);

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

    // Input is the -1..1 number read-device reports, OR a directional display
    // label ("50L"/"50R") the LLM may echo from Live's UI. Parse the label back
    // to -1..1 via the param's own display max; reject other strings instead of
    // writing NaN. ("C" already arrives as the number 0.)
    //
    // TypeScript narrows inputValue to `number` after the note branch above —
    // isValidNoteName's `x is string` predicate makes its negative case `number`
    // — but that's unsound: a non-note string like "50L" reaches here at runtime.
    // Re-widen to the real union so the label form is handled, not dead-typed.
    const panInput = inputValue as string | number;
    let numValue: number;

    if (typeof panInput === "string") {
      if (!isPanLabel(panInput)) {
        console.warn(
          `${toolName}: "${panInput}" is not a valid pan value (use -1 to 1, or "50L"/"50R"/"C")`,
        );

        return;
      }

      const maxLabel = param.call("str_for_value", max) as string;
      const minLabel = param.call("str_for_value", min) as string;
      const maxPanValue =
        extractMaxPanValue(maxLabel) || extractMaxPanValue(minLabel) || 50;

      numValue = normalizePan(panInput, maxPanValue);
    } else {
      numValue = panInput;
    }

    // Convert -1 to 1 → internal range
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
        `${toolName}: "${inputValue}" is not a valid division option`,
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

  // 6. Uninterpretable string — Live silently rejects string writes to numeric
  // params, so warn rather than pretending the update succeeded.
  const paramName = param.getProperty("name") as string;
  const inputStr = String(inputValue);

  console.warn(
    `${toolName}: could not interpret "${inputStr}" as a value for param "${paramName}" — expected a number (a unit suffix like Hz/kHz/ms/s/dB/% is optional)`,
  );
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
