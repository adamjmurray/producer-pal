// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { noteNameToMidi, isValidNoteName } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type WrittenParam,
  extractMaxPanValue,
  isDivisionLabel,
  isPanLabel,
  normalizePan,
  readParameterBasic,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import { strForValue } from "#src/tools/shared/device/helpers/device-label-helpers.ts";
import { resolveNestedParamTarget } from "#src/tools/shared/device/helpers/nested-param-target.ts";
import {
  readNumericRange,
  sentinelRawValue,
} from "#src/tools/shared/device/helpers/param-numeric-range.ts";
import {
  isParamEnabled,
  setParamValueAndVerify,
  warnParamDisabled,
} from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import { applySpecializedParamWrite } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { findRawValueForDisplay } from "./helpers/param-display-search.ts";
import { normalizeParamValue } from "./update-device-param-parser.ts";

/**
 * Set parameter values from an array of {name, value} entries. Specialized-device
 * pseudo-params (e.g. `sample` for Simpler, `routingMode` for Roar) are
 * dispatched via the specialized-device registry before falling through to
 * DeviceParameter resolution. Entries with an empty name or value are skipped.
 * @param device - LiveAPI device object to update
 * @param params - Array of {name, value} param entries
 * @param toolName - Calling tool name for warning prefix (defaults to "updateDevice")
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns The params the writes landed on
 */
export function setParamValues(
  device: LiveAPI,
  params: ParamEntry[],
  toolName: string = "updateDevice",
  force = false,
): WrittenParam[] {
  const results: WrittenParam[] = [];

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
      results.push(...setOneParam(device, key, rawValue, toolName, force));
    } catch (e) {
      console.warn(
        `${toolName}: failed to set param "${key}": ${errorMessage(e)}`,
      );
    }
  }

  return results;
}

/**
 * Resolve and set a single param entry (path-prefixed pseudo-param, specialized
 * pseudo-param, or DeviceParameter by name/index). Separated from the loop so
 * each entry can be try-isolated. Key and value are already trimmed and non-empty.
 * @param device - LiveAPI device object to update
 * @param key - Trimmed param name (may be a "/"-path or a slash-named param)
 * @param rawValue - Trimmed value
 * @param toolName - Calling tool name for warning prefix
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns The params the writes landed on
 */
function setOneParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  toolName: string,
  force: boolean,
): WrittenParam[] {
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
      return toEntries(
        setParamValue(namedParam, normalizeParamValue(rawValue), toolName),
      );
    }

    return applyNestedParam(device, key, rawValue, toolName, force);
  }

  const inputValue = normalizeParamValue(rawValue);

  // A specialized pseudo-param (e.g. Simpler's `sample`) is not a
  // DeviceParameter, so there is no value to read back.
  if (applySpecializedParamWrite(device, key, inputValue, toolName)) {
    return [];
  }

  // A purely numeric key is an absolute Live API param id.
  const param =
    resolveParamByName(device, key) ??
    (/^\d+$/.test(key) ? LiveAPI.from(key) : null);

  if (!param?.exists()) {
    console.warn(`${toolName}: param "${key}" not found on device`);

    return [];
  }

  return toEntries(setParamValue(param, inputValue, toolName));
}

/**
 * A write lands on one param or none; the callers above collect several.
 * @param result - The param one write landed on, if any
 * @returns The result as a list
 */
function toEntries(result: WrittenParam | null): WrittenParam[] {
  return result ? [result] : [];
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
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns The params the writes landed on
 */
function applyNestedParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  toolName: string,
  force: boolean,
): WrittenParam[] {
  const slashIndex = key.lastIndexOf("/");
  const prefix = key.slice(0, slashIndex);
  const paramName = key.slice(slashIndex + 1).trim();

  if (paramName === "") {
    console.warn(
      `${toolName}: skipping param "${key}" with empty name after "/"`,
    );

    return [];
  }

  const target = resolveNestedParamTarget(
    device,
    prefix,
    paramName,
    toolName,
    force,
  );

  if (!target) return [];

  // Report the param under the path the caller addressed it by: sixteen pads'
  // worth of bare "Volume" entries would name nothing.
  return setParamValues(
    target,
    [{ name: paramName, value: rawValue }],
    toolName,
    force,
  ).map((result) => ({ ...result, name: `${prefix}/${result.name}` }));
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
 * @returns The param the write landed on, or null if it did not land
 */
function setParamValue(
  param: LiveAPI,
  inputValue: string | number,
  toolName: string,
): WrittenParam | null {
  const paramName = param.getProperty("name") as string;
  const label = `${toolName}: param "${paramName}"`;

  if (!isParamEnabled(param)) {
    warnParamDisabled(label);

    return null;
  }

  const isQuantized = (param.getProperty("is_quantized") as number) > 0;

  // 1. Enum - quantized param. Resolve the input against value_items by string.
  // normalizeParamValue turns a numeric-looking label (e.g. "4" on a
  // "1"/"2"/"4"/"8" or synced note-value selector) into a number, so match
  // String(inputValue): otherwise a numeric label skips enum dispatch and falls
  // into the numeric binary-search branch, writing a garbage raw value
  // (e.g. 2.9999… instead of index 2). Quantized params are discrete enums with
  // no continuous range to search, so numeric input is always a label lookup.
  if (isQuantized) {
    const valueItems = param.getPropertyList("value_items") as string[];
    const index = valueItems.indexOf(String(inputValue));

    if (index === -1) {
      console.warn(
        `${toolName}: "${inputValue}" is not valid. Options: ${valueItems.join(", ")}`,
      );

      return null;
    }

    return writeParam(param, index, label);
  }

  // 2. Note - string matching note pattern (e.g., "C4", "F#-1")
  if (typeof inputValue === "string" && isValidNoteName(inputValue)) {
    const midi = noteNameToMidi(inputValue);

    if (midi == null) {
      console.warn(`${toolName}: invalid note name "${inputValue}"`);

      return null;
    }

    return writeParam(param, midi, label);
  }

  // 3. Pan - detect via current label, convert -1/1 to internal range
  const currentValue = param.getProperty("value") as number;
  const currentLabel = strForValue(param, currentValue);

  if (isPanLabel(currentLabel)) {
    return setPanParamValue(param, inputValue, label, toolName);
  }

  // 4. Division params - string input matching fraction format (e.g., "1/8")
  const rawMin = param.getProperty("min") as number;
  const minLabel = strForValue(param, rawMin);

  if (isDivisionLabel(currentLabel) || isDivisionLabel(minLabel)) {
    const rawValue = findDivisionRawValue(param, inputValue);

    if (rawValue == null) {
      console.warn(
        `${toolName}: "${inputValue}" is not a valid division option`,
      );

      return null;
    }

    return writeParam(param, rawValue, label);
  }

  // 5. Numeric - convert display value to raw value. A param with no numeric
  // range at all (a note-name or word-list display) has nothing to convert, so
  // the input goes to Live as a raw value the way it always has.
  const rawMax = param.getProperty("max") as number;
  const range = readNumericRange(
    param,
    rawMin,
    rawMax,
    minLabel,
    strForValue(param, rawMax),
  );

  if (typeof inputValue === "number") {
    const rawValue =
      range == null
        ? inputValue
        : findRawValueForDisplay(param, inputValue, range, label);

    return writeParam(param, rawValue, label);
  }

  // 6. The word at one end of a numeric range — Glue Compressor's Release
  // reads "A" (Auto) at its top. The search trims that end off, so naming the
  // label is the only way left to reach it.
  const sentinelRaw = range && sentinelRawValue(range, inputValue);

  if (sentinelRaw != null) {
    return writeParam(param, sentinelRaw, label);
  }

  // 7. Uninterpretable string — Live silently rejects string writes to numeric
  // params, so warn rather than pretending the update succeeded.
  const inputStr = String(inputValue);

  console.warn(
    `${toolName}: could not interpret "${inputStr}" as a value for param "${paramName}" — expected a number (a unit suffix like Hz/kHz/ms/s/dB/% is optional)`,
  );

  return null;
}

/**
 * Write a raw value and name the param for the caller. The value is not read
 * here — `refreshParamValues` reads it after everything else in the call has
 * run. A write Live ignored names nothing, the way a disabled param does: an
 * entry is only ever a value that landed.
 * @param param - Parameter to write
 * @param rawValue - Raw value to write
 * @param label - How to name the parameter in a warning
 * @returns The param the write landed on, or null if it did not land
 */
function writeParam(
  param: LiveAPI,
  rawValue: number,
  label: string,
): WrittenParam | null {
  if (!setParamValueAndVerify(param, rawValue, label)) return null;

  return readParameterBasic(param);
}

/**
 * Write a pan parameter, converting the -1..1 scale read-device reports (or a
 * directional label like "50L") into the parameter's own raw range.
 * @param param - Parameter to set
 * @param inputValue - Value to set
 * @param label - How to name the parameter in a warning
 * @param toolName - Calling tool name for warning prefix
 * @returns The param the write landed on, or null if it did not land
 */
function setPanParamValue(
  param: LiveAPI,
  inputValue: string | number,
  label: string,
  toolName: string,
): WrittenParam | null {
  const min = param.getProperty("min") as number;
  const max = param.getProperty("max") as number;

  // Input is the -1..1 number read-device reports, OR a directional display
  // label ("50L"/"50R") the LLM may echo from Live's UI. Parse the label back
  // to -1..1 via the param's own display max; reject other strings instead of
  // writing NaN. ("C" already arrives as the number 0.)
  let numValue: number;

  if (typeof inputValue === "string") {
    if (!isPanLabel(inputValue)) {
      console.warn(
        `${toolName}: "${inputValue}" is not a valid pan value (use -1 to 1, or "50L"/"50R"/"C")`,
      );

      return null;
    }

    const maxPanValue =
      extractMaxPanValue(strForValue(param, max)) ||
      extractMaxPanValue(strForValue(param, min)) ||
      50;

    numValue = normalizePan(inputValue, maxPanValue);
  } else {
    numValue = inputValue;
  }

  // Convert -1 to 1 → internal range
  return writeParam(param, ((numValue + 1) / 2) * (max - min) + min, label);
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
    if (strForValue(param, i) === targetLabel) {
      return i;
    }
  }

  return null;
}
