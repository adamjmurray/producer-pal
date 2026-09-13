// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isValidNoteName, noteNameToMidi } from "#src/shared/pitch.ts";
import {
  resolveEnumIndex,
  strForValue,
} from "#src/tools/shared/device/helpers/param-label-parsing.ts";
import {
  extractMaxPanValue,
  isDivisionParam,
  isPanLabel,
  normalizeDivisionLabel,
  normalizePan,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  readNumericRange,
  sentinelRawValue,
} from "#src/tools/shared/device/helpers/param-numeric-range.ts";
import {
  PARAM_DISABLED_REASON,
  isParamEnabled,
} from "#src/tools/shared/device/helpers/param-writing.ts";
import { setNumericParamValue } from "./param-numeric-write.ts";
import {
  type ParamWriteOutcome,
  writeParam,
} from "./param-write-verification.ts";

/**
 * Set a parameter value with type-appropriate handling. Every way the value can
 * fail to land comes back as the reason for it, which the caller reports in the
 * param's own entry — no warning, since the entry carries it.
 * @param param - Parameter to set
 * @param inputValue - Value to set
 * @param writtenText - The value as the caller wrote it, unit and all
 * @param deviceName - The device's class_display_name
 * @returns The param the write landed on, or why it landed nowhere
 */
export function setParamValue(
  param: LiveAPI,
  inputValue: string | number,
  writtenText: string,
  deviceName: string | undefined,
): ParamWriteOutcome {
  if (!isParamEnabled(param)) {
    return { reason: PARAM_DISABLED_REASON };
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
      return {
        reason: `"${inputValue}" is not valid. Options: ${valueItems.join(", ")}`,
      };
    }

    return writeParam(param, index);
  }

  // 2. Note - string matching note pattern (e.g., "C4", "F#-1")
  if (typeof inputValue === "string" && isValidNoteName(inputValue)) {
    const midi = noteNameToMidi(inputValue);

    if (midi == null) {
      return { reason: `invalid note name "${inputValue}"` };
    }

    return writeParam(param, midi);
  }

  // 3. Pan - detect via current label, convert -1/1 to internal range
  const currentValue = param.getProperty("value") as number;
  const currentLabel = strForValue(param, currentValue);

  if (isPanLabel(currentLabel)) {
    return setPanParamValue(param, inputValue);
  }

  // 4. Division params - string input matching fraction format (e.g., "1/8")
  const rawMin = param.getProperty("min") as number;
  const rawMax = param.getProperty("max") as number;
  const minLabel = strForValue(param, rawMin);
  const maxLabel = strForValue(param, rawMax);

  if (isDivisionParam(currentLabel, minLabel, maxLabel)) {
    const rawValue = findDivisionRawValue(param, inputValue);

    if (rawValue == null) {
      return { reason: `"${inputValue}" is not a valid division option` };
    }

    return writeParam(param, rawValue);
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
      paramName: param.getProperty("name") as string,
    });
  }

  // 6. The word at one end of a numeric range — Glue Compressor's Release
  // reads "A" (Auto) at its top. The search trims that end off, so naming the
  // label is the only way left to reach it.
  const sentinelRaw = range && sentinelRawValue(range, inputValue);

  if (sentinelRaw != null) {
    return writeParam(param, sentinelRaw);
  }

  // 7. Uninterpretable string — Live silently rejects string writes to numeric
  // params, so say so rather than pretending the update succeeded.
  return {
    reason: `could not interpret "${String(inputValue)}" as a value — expected a number (a unit suffix like Hz/kHz/ms/s/dB/% is optional)`,
  };
}

/**
 * Write a pan parameter, converting the -1..1 scale read-device reports (or a
 * directional label like "50L") into the parameter's own raw range.
 * @param param - Parameter to set
 * @param inputValue - Value to set
 * @returns The param the write landed on, or why it landed nowhere
 */
function setPanParamValue(
  param: LiveAPI,
  inputValue: string | number,
): ParamWriteOutcome {
  const min = param.getProperty("min") as number;
  const max = param.getProperty("max") as number;

  // Input is the -1..1 number read-device reports, OR a directional display
  // label ("50L"/"50R") the LLM may echo from Live's UI. Parse the label back
  // to -1..1 via the param's own display max; reject other strings instead of
  // writing NaN. ("C" already arrives as the number 0.)
  let numValue: number;

  if (typeof inputValue === "string") {
    if (!isPanLabel(inputValue)) {
      return {
        reason: `"${inputValue}" is not a valid pan value (use -1 to 1, or "50L"/"50R"/"C")`,
      };
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
  return writeParam(param, ((numValue + 1) / 2) * (max - min) + min);
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
