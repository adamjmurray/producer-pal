// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

// Note: pitch utilities have been centralized in #src/shared/pitch.js
// Import from there directly instead of through this file

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

interface LabelPattern {
  regex: RegExp;
  unit: string;
  multiplier?: number;
  fixedValue?: number;
  isNoteName?: boolean;
  isPan?: boolean;
}

/**
 * Label parsing patterns for extracting values and units from display labels.
 * Order matters - more specific patterns should come before general ones.
 */
const LABEL_PATTERNS: LabelPattern[] = [
  { regex: /^([\d.]+)\s*kHz$/, unit: "Hz", multiplier: 1000 },
  { regex: /^([\d.]+)\s*Hz$/, unit: "Hz", multiplier: 1 },
  { regex: /^([\d.]+)\s*s$/, unit: "ms", multiplier: 1000 },
  { regex: /^([\d.]+)\s*ms$/, unit: "ms", multiplier: 1 },
  { regex: /^([\d.-]+)\s*dB$/, unit: "dB", multiplier: 1 },
  { regex: /^(-?inf)\s*dB$/, unit: "dB", fixedValue: -70 },
  { regex: /^([\d.-]+)\s*%$/, unit: "%", multiplier: 1 },
  { regex: /^([+-]?\d+)\s*st$/, unit: "semitones", multiplier: 1 },
  { regex: /^([A-G][#b]?-?\d+)$/, unit: "note", isNoteName: true },
  { regex: /^(\d+)([LR])$/, unit: "pan", isPan: true },
  { regex: /^(C)$/, unit: "pan", fixedValue: 0 },
];

export interface ParsedLabel {
  value: number | string | null;
  unit: string | null;
  direction?: string;
}

/**
 * Format parameter name, appending original_name if different (e.g. for rack macros).
 * @param paramApi - LiveAPI parameter object
 * @returns Formatted name like "Reverb (Macro 1)" or just "Device On"
 */
function formatParamName(paramApi: LiveAPI): string {
  const name = paramApi.getProperty("name") as string;
  const originalName = paramApi.getProperty("original_name") as string;

  return originalName !== name ? `${name} (${originalName})` : name;
}

/**
 * Parse a label string to extract numeric value and unit.
 * @param label - Display label from str_for_value()
 * @returns Parsed value and unit
 */
export function parseLabel(label: string): ParsedLabel {
  if (!label || typeof label !== "string") {
    return { value: null, unit: null };
  }

  for (const pattern of LABEL_PATTERNS) {
    const match = label.match(pattern.regex);

    if (!match) continue;

    if (pattern.fixedValue !== undefined) {
      return { value: pattern.fixedValue, unit: pattern.unit };
    }

    if (pattern.isNoteName) {
      return { value: match[1] as string, unit: "note" };
    }

    if (pattern.isPan) {
      // Will be normalized later when we know the max pan value
      const num = Number.parseInt(match[1] as string);
      const dir = match[2] as string;

      return { value: num, unit: "pan", direction: dir };
    }

    return {
      value: Number.parseFloat(match[1] as string) * (pattern.multiplier ?? 1),
      unit: pattern.unit,
    };
  }

  // No unit detected - try to extract just a number
  const numMatch = label.match(/^([\d.-]+)/);

  if (numMatch) {
    return {
      value: Number.parseFloat(numMatch[1] as string),
      unit: null,
    };
  }

  return { value: null, unit: null };
}

/**
 * Check if a label represents a pan value.
 * @param label - Display label
 * @returns True if label is a pan format
 */
export function isPanLabel(label: string): boolean {
  if (!label || typeof label !== "string") return false;

  return /^(\d+[LR]|C)$/.test(label);
}

/**
 * Check if a label is a division fraction format (e.g., "1/8", "1/16").
 * @param label - Display label
 * @returns True if label is a division fraction
 */
export function isDivisionLabel(label: string): boolean {
  return typeof label === "string" && /^1\/\d+$/.test(label);
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
  valueLabel: string | number,
  rawMin: number,
  rawMax: number,
): Record<string, unknown> {
  // Enumerate all integer values as options
  const minInt = Math.ceil(Math.min(rawMin, rawMax));
  const maxInt = Math.floor(Math.max(rawMin, rawMax));
  const options: string[] = [];

  for (let i = minInt; i <= maxInt; i++) {
    const label = paramApi.call("str_for_value", i) as string | number;

    options.push(typeof label === "number" ? String(label) : label);
  }

  return {
    id: paramApi.id,
    name,
    value: typeof valueLabel === "number" ? String(valueLabel) : valueLabel,
    options,
  };
}

/**
 * Normalize pan value to -1 to 1 range.
 * @param label - Pan label (e.g., "50L", "C", "50R")
 * @param maxPanValue - Maximum pan value (e.g., 50)
 * @returns Normalized pan value (-1 to 1)
 */
export function normalizePan(label: string, maxPanValue: number): number {
  if (label === "C") return 0;

  const match = label.match(/^(\d+)([LR])$/);

  if (!match) return 0;

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

  if (!isEnabled) result.enabled = false;
  if (state && state !== "active") result.state = state;

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
 * @returns Parameter info object
 */
export function readParameter(paramApi: LiveAPI): Record<string, unknown> {
  const name = formatParamName(paramApi);
  const stateIdx = paramApi.getProperty("state") as number;
  const automationIdx = paramApi.getProperty("automation_state") as number;
  const state = PARAM_STATE_MAP[stateIdx];
  const automationState = AUTOMATION_STATE_MAP[automationIdx];

  if ((paramApi.getProperty("is_quantized") as number) > 0) {
    const valueItems = paramApi.get("value_items") as string[];
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
  const valueLabel = paramApi.call("str_for_value", rawValue) as string;
  const minLabel = paramApi.call("str_for_value", rawMin) as string;
  const maxLabel = paramApi.call("str_for_value", rawMax) as string;

  // Check for division-type params (fraction format like "1/8")
  if (isDivisionLabel(valueLabel) || isDivisionLabel(minLabel)) {
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
  const unit = valueParsed.unit ?? minParsed.unit ?? maxParsed.unit;

  if (unit === "pan") {
    const maxPanValue =
      extractMaxPanValue(maxLabel) || extractMaxPanValue(minLabel) || 50;
    const result: Record<string, unknown> = {
      id: paramApi.id,
      name,
      value: normalizePan(valueLabel, maxPanValue),
      min: -1,
      max: 1,
      unit: "pan",
    };

    addStateFlags(result, paramApi, state, automationState);

    return result;
  }

  const result: Record<string, unknown> = {
    id: paramApi.id,
    name,
    value:
      valueParsed.value ?? paramApi.getProperty("display_value") ?? rawValue,
    min: minParsed.value ?? rawMin,
    max: maxParsed.value ?? rawMax,
  };

  if (unit) result.unit = unit;
  addStateFlags(result, paramApi, state, automationState);

  return result;
}
