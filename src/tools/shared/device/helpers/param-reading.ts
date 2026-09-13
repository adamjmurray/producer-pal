// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Note: pitch utilities have been centralized in #src/shared/pitch.js
// Import from there directly instead of through this file

import {
  parseLabel,
  strForValue,
  unitForLabels,
} from "./param-label-parsing.ts";
import { recordedUnitFor } from "../known-param-units.ts";
import { readNumericRange } from "./param-numeric-range.ts";

// Parameter state mapping (0=active, 1=inactive, 2=disabled)
export const PARAM_STATE_MAP: Record<number, string> = {
  0: "active",
  1: "inactive",
  2: "disabled",
};

// Automation state mapping (0=none, 1=active, 2=overridden)
export const AUTOMATION_STATE_MAP: Record<number, string> = {
  0: "none",
  1: "active",
  2: "overridden",
};

/**
 * Format parameter name, appending original_name if different (e.g. for rack macros).
 * @param paramApi - LiveAPI parameter object
 * @returns Formatted name like "Reverb (Macro 1)" or just "Device On"
 */
function formatParamName(paramApi: LiveAPI): string {
  const name = paramApi.getName();
  const rawOriginalName = paramApi.getProperty("original_name") as
    | string
    | number
    | undefined;
  const originalName = String(rawOriginalName ?? "");

  return originalName !== name ? `${name} (${originalName})` : name;
}

/**
 * Check if a label represents a pan value.
 * @param label - Display label
 * @returns True if label is a pan format
 */
export function isPanLabel(label: string): boolean {
  if (!label || typeof label !== "string") {
    return false;
  }

  return /^(\d+[LR]|C)$/.test(label);
}

/**
 * Check if a label is a division fraction format (e.g., "1/8", "1/16").
 * Live spaces the slash on some params ("1 / 16") and not on others.
 * @param label - Display label
 * @returns True if label is a division fraction
 */
export function isDivisionLabel(label: string): boolean {
  return typeof label === "string" && /^1\s*\/\s*\d+$/.test(label);
}

/**
 * Whether a param's display is a ladder of divisions. Any end is enough: a
 * sync ladder that runs from bar counts up to fractions ("8".."1/64") shows a
 * bare number at both its current value and its minimum, and only names a
 * fraction at the far end.
 * @param labels - The param's value, min and max labels
 * @returns True if any label is a division fraction
 */
export function isDivisionParam(...labels: string[]): boolean {
  return labels.some(isDivisionLabel);
}

/**
 * A division label with its spacing removed, so "1 / 16" and "1/16" compare
 * equal. Whatever a caller writes has to match a label Live produced.
 * @param label - Display label
 * @returns The label with all whitespace stripped
 */
export function normalizeDivisionLabel(label: string): string {
  return label.replaceAll(/\s+/g, "");
}

/**
 * Build result for division-type parameters with enum-like options.
 * @param paramApi - LiveAPI parameter object
 * @param name - Formatted parameter name
 * @param valueLabel - Current value label
 * @param rawMin - Raw minimum value
 * @param rawMax - Raw maximum value
 * @returns Parameter result with value and options
 */
function buildDivisionParamResult(
  paramApi: LiveAPI,
  name: string,
  valueLabel: string,
  rawMin: number,
  rawMax: number,
): Record<string, unknown> {
  // Enumerate all integer values as options
  const minInt = Math.ceil(Math.min(rawMin, rawMax));
  const maxInt = Math.floor(Math.max(rawMin, rawMax));
  const options: string[] = [];

  for (let i = minInt; i <= maxInt; i++) {
    options.push(strForValue(paramApi, i));
  }

  return {
    id: paramApi.id,
    name,
    value: valueLabel,
    options,
  };
}

/**
 * Build result for pan-type parameters, whose display is directional ("50L").
 * @param paramApi - LiveAPI parameter object
 * @param name - Formatted parameter name
 * @param valueLabel - Current value label
 * @param minLabel - Raw minimum's label
 * @param maxLabel - Raw maximum's label
 * @returns Parameter result on the -1..1 scale
 */
function buildPanParamResult(
  paramApi: LiveAPI,
  name: string,
  valueLabel: string,
  minLabel: string,
  maxLabel: string,
): Record<string, unknown> {
  const maxPanValue =
    extractMaxPanValue(maxLabel) || extractMaxPanValue(minLabel) || 50;

  return {
    id: paramApi.id,
    name,
    value: normalizePan(valueLabel, maxPanValue),
    min: -1,
    max: 1,
    unit: "pan",
  };
}

/**
 * Normalize pan value to -1 to 1 range.
 * @param label - Pan label (e.g., "50L", "C", "50R")
 * @param maxPanValue - Maximum pan value (e.g., 50)
 * @returns Normalized pan value (-1 to 1)
 */
export function normalizePan(label: string, maxPanValue: number): number {
  if (label === "C") {
    return 0;
  }

  const match = label.match(/^(\d+)([LR])$/);

  if (!match) {
    return 0;
  }

  const num = Number.parseInt(match[1] as string);
  const dir = match[2] as string;

  return dir === "L" ? -num / maxPanValue : num / maxPanValue;
}

/**
 * Extract max pan value from min or max label.
 * @param label - Min or max pan label (e.g., "50L" or "50R")
 * @returns Max pan value
 */
export function extractMaxPanValue(label: string): number {
  const match = label.match(/^(\d+)[LR]$/);

  return match ? Number.parseInt(match[1] as string) : 50;
}

/**
 * Add state flags to result object
 * @param result - Result object to add flags to
 * @param paramApi - LiveAPI parameter object
 * @param state - Parameter state
 * @param automationState - Automation state
 */
function addStateFlags(
  result: Record<string, unknown>,
  paramApi: LiveAPI,
  state: string | undefined,
  automationState: string | undefined,
): void {
  const isEnabled = (paramApi.getProperty("is_enabled") as number) > 0;

  if (!isEnabled) {
    result.enabled = false;
  }

  if (state && state !== "active") {
    result.state = state;
  }

  if (automationState && automationState !== "none") {
    result.automation = automationState;
  }
}

/**
 * Read basic parameter info (id and name only)
 * @param paramApi - LiveAPI parameter object
 * @returns Parameter info with id and name
 */
export function readParameterBasic(paramApi: LiveAPI): {
  id: string;
  name: string;
} {
  const name = formatParamName(paramApi);

  return { id: paramApi.id, name };
}

/**
 * Read a single device parameter with full details.
 * @param paramApi - LiveAPI parameter object
 * @param deviceName - The device's class_display_name, for the recorded-unit
 *   lookup. Omitted where the device isn't known; the param then reports a unit
 *   only if its own labels carry one.
 * @returns Parameter info object
 */
export function readParameter(
  paramApi: LiveAPI,
  deviceName?: string,
): Record<string, unknown> {
  const name = formatParamName(paramApi);
  const stateIdx = paramApi.getProperty("state") as number;
  const automationIdx = paramApi.getProperty("automation_state") as number;
  const state = PARAM_STATE_MAP[stateIdx];
  const automationState = AUTOMATION_STATE_MAP[automationIdx];

  if ((paramApi.getProperty("is_quantized") as number) > 0) {
    const valueItems = paramApi.getPropertyList("value_items") as string[];
    const valueIdx = paramApi.getProperty("value") as number;
    const result: Record<string, unknown> = {
      id: paramApi.id,
      name,
      value: valueItems[valueIdx],
      options: valueItems,
    };

    addStateFlags(result, paramApi, state, automationState);

    return result;
  }

  const rawValue = paramApi.getProperty("value") as number;
  const rawMin = paramApi.getProperty("min") as number;
  const rawMax = paramApi.getProperty("max") as number;
  const valueLabel = strForValue(paramApi, rawValue);
  const minLabel = strForValue(paramApi, rawMin);
  const maxLabel = strForValue(paramApi, rawMax);

  // Check for division-type params (fraction format like "1/8")
  if (isDivisionParam(valueLabel, minLabel, maxLabel)) {
    const result = buildDivisionParamResult(
      paramApi,
      name,
      valueLabel,
      rawMin,
      rawMax,
    );

    addStateFlags(result, paramApi, state, automationState);

    return result;
  }

  const valueParsed = parseLabel(valueLabel);
  const minParsed = parseLabel(minLabel);
  const maxParsed = parseLabel(maxLabel);
  const unit = unitForLabels(valueLabel, minLabel, maxLabel);

  if (unit === "pan") {
    const result = buildPanParamResult(
      paramApi,
      name,
      valueLabel,
      minLabel,
      maxLabel,
    );

    addStateFlags(result, paramApi, state, automationState);

    return result;
  }

  // A word at one end (Glue Compressor's Release reads "A" for Auto) is not a
  // number, so without this the range falls back to raw units and advertises a
  // max the param can never display.
  const range = readNumericRange(paramApi, rawMin, rawMax, minLabel, maxLabel);
  const sentinel = range?.sentinel;
  // Some of Live's stock params display a bare number and nothing else. Fall
  // back to the recorded one so the model has something to write back.
  const reportedUnit =
    unit ?? recordedUnitFor(unit, range, deviceName, name)?.unit;
  const result: Record<string, unknown> = {
    id: paramApi.id,
    name,
    value:
      (sentinel?.label === valueLabel ? valueLabel : valueParsed.value) ??
      paramApi.getProperty("display_value") ??
      rawValue,
    min: range?.minValue ?? minParsed.value ?? rawMin,
    max: range?.maxValue ?? maxParsed.value ?? rawMax,
  };

  if (reportedUnit) {
    result.unit = reportedUnit;
  }

  if (sentinel) {
    result.alsoAccepts = sentinel.label;
  }

  addStateFlags(result, paramApi, state, automationState);

  return result;
}

/**
 * A param a write landed on. Its value is read once, at the end of the call.
 * `reason` is there only when the value that landed isn't the one asked for — a
 * clamp, or the nearest step of a coarse ladder. The value is still reported, so
 * there is no `ok`.
 */
export interface WrittenParam {
  id: string;
  name: string;
  reason?: string;
}

/**
 * A param the call named that nothing was written to, named the way the call
 * spelled it. It has no id and no value, so `reason` says why. `ok` marks only
 * these, never a param that landed.
 */
export interface UnresolvedParam {
  name: string;
  ok: false;
  reason: string;
}

/**
 * A pseudo-param a write landed on (Simpler's `sample`, Roar's `routingMode`).
 * It is a device property, not a DeviceParameter, so it has no id to read
 * through and carries its own read instead. The read runs before the call
 * returns, so the device it closes over is still this request's. A forced pad
 * swap later in the same call can still delete that device, and the read then
 * comes back empty — the same staleness the id path already has.
 */
export interface WrittenPseudoParam {
  name: string;
  read: () => unknown;
  /**
   * Why the read-back is not the value the write asked for, or undefined when
   * it landed. Only params a device takes whole or ignores carry this — see
   * `PseudoParam.writeFailed`.
   */
  writeFailed?: (readBack: unknown) => string | undefined;
}

/** One param the call named: what a write landed on, or why nothing did. */
export type ParamOutcome = WrittenParam | WrittenPseudoParam | UnresolvedParam;

/**
 * The entry for a param nothing was written to. Nothing warns as well: this is
 * where the caller reads what happened to that param.
 * @param name - The param name as the call spelled it
 * @param reason - Why nothing was written
 * @returns The skip entry
 */
export function skippedParam(name: string, reason: string): UnresolvedParam {
  return { name, ok: false, reason };
}

/** What create-device and update-device report for each param they wrote. */
export interface ParamValueResult extends WrittenParam {
  value: unknown;
}

/** What they report for a written pseudo-param, which has no id. */
export interface PseudoParamValueResult {
  name: string;
  value: unknown;
}

/** One entry of the `params` a create-device or update-device result reports. */
export type ParamResult =
  | ParamValueResult
  | PseudoParamValueResult
  | UnresolvedParam;

/** Why a pseudo-param a write landed on still has nothing to report. */
const NO_VALUE_AFTER_WRITE = "written, but no value reads back";

/**
 * Read the values of the params a call wrote, once everything else in that call
 * has run. An A/B compare swap or a macro-variation recall rewrites the values a
 * `params` write just landed, so reading at write time would report what the
 * same call went on to overwrite. This is the only place a written param's value
 * comes from, and it reads the same as read-device's, so a write and a read can
 * never disagree.
 *
 * Assumes the params are still there: nothing that runs after a `params` write
 * removes a device.
 *
 * The name stays as reported — a path-prefixed write is named by the path the
 * caller used, not by the param's own name. An entry that resolved to nothing
 * passes through: it has no id to read.
 * @param outcomes - Every param the call named
 * @returns The written ones with their current values, the rest unchanged
 */
export function refreshParamValues(outcomes: ParamOutcome[]): ParamResult[] {
  return outcomes.flatMap((entry): ParamResult[] => {
    if ("id" in entry) {
      return [
        writtenResult(entry, readParameter(LiveAPI.from(entry.id)).value),
      ];
    }

    // A pseudo-param brings its own read; the read itself is not reported. A
    // meaningful null (e.g. Compressor's "No Input" sidechain source) reports
    // as a value. undefined means the param does not apply in the device's
    // current state — and only a param a write landed on gets here, so the
    // write went in and the device still shows nothing. That is a silent
    // refusal (an absolute `sample` path naming no file loads nothing), and
    // read-device omits the param too, so dropping the entry would leave
    // nothing anywhere to say the value never arrived.
    if ("read" in entry) {
      const value = entry.read();

      if (value === undefined) {
        return [skippedParam(entry.name, NO_VALUE_AFTER_WRITE)];
      }

      // A device that ignored the write left the value it already had, and
      // reporting that as the value would read as a write that landed.
      const failed = entry.writeFailed?.(value);

      return failed == null
        ? [{ name: entry.name, value }]
        : [skippedParam(entry.name, failed)];
    }

    return [entry];
  });
}

/**
 * One written param's entry, with the value it reads as. The reason a value was
 * changed on its way in comes after the value it changed to.
 * @param entry - The param the write landed on
 * @param value - What it reads as now
 * @returns The result entry
 */
function writtenResult(entry: WrittenParam, value: unknown): ParamValueResult {
  const { id, name, reason } = entry;

  return reason == null ? { id, name, value } : { id, name, value, reason };
}
