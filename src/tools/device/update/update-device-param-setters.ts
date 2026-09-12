// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { noteNameToMidi, isValidNoteName } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamOutcome,
  type WrittenParam,
  extractMaxPanValue,
  isDivisionParam,
  normalizeDivisionLabel,
  isPanLabel,
  normalizePan,
  readParameterBasic,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  resolveEnumIndex,
  strForValue,
  unitForLabels,
} from "#src/tools/shared/device/helpers/param-label-parsing.ts";
import {
  isDrumPadSampleShortcut,
  resolveNestedParamTarget,
  splitForAdvice,
} from "#src/tools/shared/device/helpers/nested-param-target.ts";
import { recordedUnitFor } from "#src/tools/shared/device/known-param-units.ts";
import {
  isSampleParam,
  unsettableSampleReason,
} from "#src/tools/shared/device/pad-sample-messages.ts";
import {
  type ParamNumericRange,
  readNumericRange,
  sentinelRawValue,
} from "#src/tools/shared/device/helpers/param-numeric-range.ts";
import {
  isParamEnabled,
  setParamValueAndVerify,
  warnParamDisabled,
} from "#src/tools/shared/device/helpers/param-writing.ts";
import { applySpecializedParamWrite } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import {
  pathPrefix,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { findRawValueForDisplay } from "./helpers/params/param-display-search.ts";
import {
  resolveParamById,
  resolveParamsByName,
  warnIfAmbiguousName,
} from "./helpers/params/param-name-resolution.ts";
import { displayValueForWrite } from "./helpers/params/param-unit-check.ts";
import { normalizeParamValue } from "./update-device-param-parser.ts";

/**
 * Set parameter values from an array of {name, value} entries. Specialized-device
 * pseudo-params (e.g. `sample` for Simpler, `routingMode` for Roar) are
 * dispatched via the specialized-device registry before falling through to
 * DeviceParameter resolution. Entries with an empty name or value are skipped.
 * @param device - LiveAPI device object to update
 * @param params - Array of {name, value} param entries
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns The params the writes landed on, plus the ones that named nothing
 */
export function setParamValues(
  device: LiveAPI,
  params: ParamEntry[],
  force = false,
): ParamOutcome[] {
  const results: ParamOutcome[] = [];
  // Read once per device, not per param: it only names the device for the
  // recorded-unit lookup.
  const deviceName = device.getProperty("class_display_name") as
    | string
    | undefined;

  for (const entry of params) {
    // Malformed entries were refused up front, so both sides are non-empty.
    const key = entry.name.trim();
    const rawValue = entry.value.trim();

    // Isolate each param: a throw resolving one (e.g. a path-prefixed pad param
    // whose chain auto-create exceeds the cap) must not abort the rest of a
    // multi-param update. Warn and move on, consistent with update tools'
    // warn-and-skip contract.
    try {
      results.push(...setOneParam(device, key, rawValue, force, deviceName));
    } catch (e) {
      console.warn(
        `failed to set param "${key}" on ${targetLabel(device)}: ${errorMessage(e)}`,
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
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @param deviceName - The device's class_display_name
 * @returns The params the writes landed on, plus the ones that named nothing
 */
function setOneParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  force: boolean,
  deviceName: string | undefined,
): ParamOutcome[] {
  // A name containing "/" is normally a path-prefixed pseudo-param
  // (e.g. "pC1/sample"): resolve the prefix relative to this device, then
  // write the trailing param to the target. But some real DeviceParameters
  // have a "/" in their name (e.g. "Dry/Wet" on Reverb/Delay/Glue Compressor),
  // so prefer an exact param-name match first and only fall back to
  // path-routing when no such param exists — keeping slash-named params
  // settable by name.
  if (key.includes("/")) {
    const matches = resolveParamsByName(device, key);

    if (warnIfAmbiguousName(matches, key, device)) {
      return [];
    }

    const namedParam = matches[0];

    if (namedParam?.exists()) {
      return toEntries(
        setParamValue(
          namedParam,
          normalizeParamValue(rawValue, deviceName, key),
          rawValue,
          device,
          deviceName,
        ),
      );
    }

    return applyNestedParam(device, key, rawValue, force);
  }

  const inputValue = normalizeParamValue(rawValue, deviceName, key);

  // A specialized pseudo-param (e.g. Simpler's `sample`) is a device property
  // rather than a DeviceParameter, so it reports a name and a value but no id.
  // Empty means the key was a pseudo-param whose write was refused.
  const pseudoParam = applySpecializedParamWrite(device, key, inputValue);

  if (pseudoParam != null) {
    return pseudoParam;
  }

  const matches = resolveParamsByName(device, key);

  if (warnIfAmbiguousName(matches, key, device)) {
    return [];
  }

  const named = matches[0];

  if (named?.exists()) {
    return toEntries(
      setParamValue(named, inputValue, rawValue, device, deviceName),
    );
  }

  // A `sample` write that matched no pseudo-param and no parameter reached a
  // device with no sample to set. "Not found" would read as a misspelling and
  // send the model hunting for the right name; the reason below says what is
  // true, and on a drum pad names the (destructive) call that can honor it.
  if (isSampleParam(key)) {
    const unsettable = unsettableSampleReason(device);

    console.warn(unsettable);

    return [{ name: key, reason: unsettable }];
  }

  const lookup = resolveParamById(key, device);

  // The key reached no parameter of this device, so the entry says so instead
  // of dropping out: a list that came back a name short is one the caller has
  // to diff against its own request to read.
  if ("reason" in lookup) {
    return [{ name: key, reason: lookup.reason }];
  }

  return toEntries(
    setParamValue(lookup.param, inputValue, rawValue, device, deviceName),
  );
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
 *
 * Every form but the drum-pad `sample` shortcut is deprecated: the nested
 * device it names is reachable by its own `path` instead. That warning fires
 * before resolution is attempted, so it still reaches a prefix that resolves
 * to nothing.
 * @param device - The device the path prefix is relative to (e.g. a Drum Rack)
 * @param key - Full path-prefixed param name (e.g. "pC1/sample")
 * @param rawValue - Trimmed value to write
 * @param force - Allow a destructive pad-device swap a `sample` write needs
 * @returns The params the writes landed on, plus the ones that named nothing
 */
function applyNestedParam(
  device: LiveAPI,
  key: string,
  rawValue: string,
  force: boolean,
): ParamOutcome[] {
  const slashIndex = key.lastIndexOf("/");
  const prefix = key.slice(0, slashIndex);
  // Refused up front, so there is a name after the last "/".
  const paramName = key.slice(slashIndex + 1).trim();

  if (!isDrumPadSampleShortcut(prefix, paramName)) {
    // Advice is split from the LEFT (see splitForAdvice), independent of the
    // resolution split above: a slash-named param like Dry/Wet needs the
    // whole "Dry/Wet" as its name, not just "Wet", or the path this names
    // wouldn't resolve either.
    const advice = splitForAdvice(key);

    console.warn(
      `params name "${key}" is deprecated and will be removed; use path "${pathPrefix(device)}/${advice.path}" with name "${advice.name}"`,
    );
  }

  const target = resolveNestedParamTarget(device, prefix, paramName, force);

  // Named as the caller wrote it: a list that came back a name short is one
  // the caller has to diff against its own request to read.
  if ("reason" in target) {
    return [{ name: key, reason: target.reason }];
  }

  // Report the param under the path the caller addressed it by: sixteen pads'
  // worth of bare "Volume" entries would name nothing.
  return setParamValues(
    target.device,
    [{ name: paramName, value: rawValue }],
    force,
  ).map((result) => ({ ...result, name: `${prefix}/${result.name}` }));
}

/**
 * Set a parameter value with type-appropriate handling
 * @param param - Parameter to set
 * @param inputValue - Value to set
 * @param writtenText - The value as the caller wrote it, unit and all
 * @param device - The device the param belongs to, for the warning
 * @param deviceName - The device's class_display_name
 * @returns The param the write landed on, or null if it did not land
 */
function setParamValue(
  param: LiveAPI,
  inputValue: string | number,
  writtenText: string,
  device: LiveAPI,
  deviceName: string | undefined,
): WrittenParam | null {
  const paramName = param.getProperty("name") as string;
  // The device carries the path — a param has none of its own — and the param
  // carries the two handles a retry can use, its name and its id.
  const label = `${targetLabel(device)} param "${paramName}" (id ${param.id})`;

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
    const index = resolveEnumIndex(valueItems, inputValue);

    if (index === -1) {
      console.warn(
        `${label}: "${inputValue}" is not valid. Options: ${valueItems.join(", ")}`,
      );

      return null;
    }

    return writeParam(param, index, label);
  }

  // 2. Note - string matching note pattern (e.g., "C4", "F#-1")
  if (typeof inputValue === "string" && isValidNoteName(inputValue)) {
    const midi = noteNameToMidi(inputValue);

    if (midi == null) {
      console.warn(`${label}: invalid note name "${inputValue}"`);

      return null;
    }

    return writeParam(param, midi, label);
  }

  // 3. Pan - detect via current label, convert -1/1 to internal range
  const currentValue = param.getProperty("value") as number;
  const currentLabel = strForValue(param, currentValue);

  if (isPanLabel(currentLabel)) {
    return setPanParamValue(param, inputValue, label);
  }

  // 4. Division params - string input matching fraction format (e.g., "1/8")
  const rawMin = param.getProperty("min") as number;
  const rawMax = param.getProperty("max") as number;
  const minLabel = strForValue(param, rawMin);
  const maxLabel = strForValue(param, rawMax);

  if (isDivisionParam(currentLabel, minLabel, maxLabel)) {
    const rawValue = findDivisionRawValue(param, inputValue);

    if (rawValue == null) {
      console.warn(`${label}: "${inputValue}" is not a valid division option`);

      return null;
    }

    return writeParam(param, rawValue, label);
  }

  // 5. Numeric - convert display value to raw value. A param with no numeric
  // range at all (a note-name or word-list display) has nothing to convert, so
  // the input goes to Live as a raw value the way it always has.
  const range = readNumericRange(param, rawMin, rawMax, minLabel, maxLabel);

  if (typeof inputValue === "number") {
    return setNumericParamValue({
      param,
      inputValue,
      range,
      currentLabel,
      minLabel,
      maxLabel,
      writtenText,
      deviceName,
      paramName,
      label,
    });
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
    `${label}: could not interpret "${inputStr}" as a value — expected a number (a unit suffix like Hz/kHz/ms/s/dB/% is optional)`,
  );

  return null;
}

/** Everything the numeric write path needs about the param and the request. */
interface NumericWrite {
  param: LiveAPI;
  inputValue: number;
  range: ParamNumericRange | null;
  currentLabel: string;
  minLabel: string;
  maxLabel: string;
  writtenText: string;
  deviceName: string | undefined;
  paramName: string;
  label: string;
}

/**
 * Write a number to a param that displays a number line, converting from the
 * param's own display units. A param with no numeric range at all (a note-name
 * or word-list display) has nothing to convert, so the input goes to Live as a
 * raw value the way it always has.
 * @param write - The param, the requested value and the param's labels
 * @returns The param the write landed on, or null if it did not land
 */
function setNumericParamValue(write: NumericWrite): WrittenParam | null {
  const { param, range, label } = write;
  // Name the range by its trimmed ends: a param with a word at one end
  // (Glue Compressor's Release tops out at "A") would otherwise be described
  // as running "from 0.1 to A".
  const ends = range ?? { minLabel: write.minLabel, maxLabel: write.maxLabel };
  const labelUnit = unitForLabels(
    write.currentLabel,
    ends.minLabel,
    ends.maxLabel,
  );
  const displayValue = displayValueForWrite({
    writtenText: write.writtenText,
    inputValue: write.inputValue,
    labelUnit,
    known: recordedUnitFor(labelUnit, range, write.deviceName, write.paramName),
    minLabel: ends.minLabel,
    maxLabel: ends.maxLabel,
    label,
  });

  if (displayValue == null) {
    return null;
  }

  const targetRaw =
    range == null
      ? displayValue
      : findRawValueForDisplay(param, displayValue, range, label);

  if (targetRaw == null) {
    return null;
  }

  return writeParam(param, targetRaw, label);
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
  if (!setParamValueAndVerify(param, rawValue, label)) {
    return null;
  }

  return readParameterBasic(param);
}

/**
 * Write a pan parameter, converting the -1..1 scale read-device reports (or a
 * directional label like "50L") into the parameter's own raw range.
 * @param param - Parameter to set
 * @param inputValue - Value to set
 * @param label - How to name the parameter in a warning
 * @returns The param the write landed on, or null if it did not land
 */
function setPanParamValue(
  param: LiveAPI,
  inputValue: string | number,
  label: string,
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
        `${label}: "${inputValue}" is not a valid pan value (use -1 to 1, or "50L"/"50R"/"C")`,
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
  const wantedLabel =
    typeof inputValue === "number" ? String(inputValue) : inputValue;

  const target = normalizeDivisionLabel(wantedLabel);

  for (let i = minInt; i <= maxInt; i++) {
    if (normalizeDivisionLabel(strForValue(param, i)) === target) {
      return i;
    }
  }

  return null;
}
