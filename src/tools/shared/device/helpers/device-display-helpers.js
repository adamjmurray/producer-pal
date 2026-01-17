// @ts-nocheck -- TODO: Add JSDoc type annotations
// Note: pitch utilities have been centralized in #src/shared/pitch.js
// Import from there directly instead of through this file

// Parameter state mapping (0=active, 1=inactive, 2=disabled)
export const PARAM_STATE_MAP = {
  0: "active",
  1: "inactive",
  2: "disabled",
};

// Automation state mapping (0=none, 1=active, 2=overridden)
export const AUTOMATION_STATE_MAP = {
  0: "none",
  1: "active",
  2: "overridden",
};

/**
 * Label parsing patterns for extracting values and units from display labels.
 * Order matters - more specific patterns should come before general ones.
 */
const LABEL_PATTERNS = [
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

/**
 * Format parameter name, appending original_name if different (e.g. for rack macros).
 * @param {object} paramApi - LiveAPI parameter object
 * @returns {string} Formatted name like "Reverb (Macro 1)" or just "Device On"
 */
function formatParamName(paramApi) {
  const name = paramApi.getProperty("name");
  const originalName = paramApi.getProperty("original_name");

  return originalName !== name ? `${name} (${originalName})` : name;
}

/**
 * Parse a label string to extract numeric value and unit.
 * @param {string} label - Display label from str_for_value()
 * @returns {{value: number|string|null, unit: string|null}} Parsed value and unit
 */
export function parseLabel(label) {
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
      return { value: match[1], unit: "note" };
    }

    if (pattern.isPan) {
      // Will be normalized later when we know the max pan value
      const num = Number.parseInt(match[1]);
      const dir = match[2];

      return { value: num, unit: "pan", direction: dir };
    }

    return {
      value: Number.parseFloat(match[1]) * (pattern.multiplier || 1),
      unit: pattern.unit,
    };
  }

  // No unit detected - try to extract just a number
  const numMatch = label.match(/^([\d.-]+)/);

  if (numMatch) {
    return { value: Number.parseFloat(numMatch[1]), unit: null };
  }

  return { value: null, unit: null };
}

/**
 * Check if a label represents a pan value.
 * @param {string} label - Display label
 * @returns {boolean} True if label is a pan format
 */
export function isPanLabel(label) {
  if (!label || typeof label !== "string") return false;

  return /^(\d+[LR]|C)$/.test(label);
}

/**
 * Check if a label is a division fraction format (e.g., "1/8", "1/16").
 * @param {string} label - Display label
 * @returns {boolean} True if label is a division fraction
 */
export function isDivisionLabel(label) {
  return typeof label === "string" && /^1\/\d+$/.test(label);
}

/**
 * Build result for division-type parameters with enum-like options.
 * @param {object} paramApi - LiveAPI parameter object
 * @param {string} name - Formatted parameter name
 * @param {string|number} valueLabel - Current value label
 * @param {number} rawMin - Raw minimum value
 * @param {number} rawMax - Raw maximum value
 * @returns {object} Parameter result with value and options
 */
function buildDivisionParamResult(paramApi, name, valueLabel, rawMin, rawMax) {
  // Enumerate all integer values as options
  const minInt = Math.ceil(Math.min(rawMin, rawMax));
  const maxInt = Math.floor(Math.max(rawMin, rawMax));
  const options = [];

  for (let i = minInt; i <= maxInt; i++) {
    const label = paramApi.call("str_for_value", i);

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
 * @param {string} label - Pan label (e.g., "50L", "C", "50R")
 * @param {number} maxPanValue - Maximum pan value (e.g., 50)
 * @returns {number} Normalized pan value (-1 to 1)
 */
export function normalizePan(label, maxPanValue) {
  if (label === "C") return 0;

  const match = label.match(/^(\d+)([LR])$/);

  if (!match) return 0;

  const num = Number.parseInt(match[1]);
  const dir = match[2];

  return dir === "L" ? -num / maxPanValue : num / maxPanValue;
}

/**
 * Extract max pan value from min or max label.
 * @param {string} label - Min or max pan label (e.g., "50L" or "50R")
 * @returns {number} Max pan value
 */
export function extractMaxPanValue(label) {
  const match = label.match(/^(\d+)[LR]$/);

  return match ? Number.parseInt(match[1]) : 50;
}

function addStateFlags(result, paramApi, state, automationState) {
  const isEnabled = paramApi.getProperty("is_enabled") > 0;

  if (!isEnabled) result.enabled = false;
  if (state && state !== "active") result.state = state;

  if (automationState && automationState !== "none") {
    result.automation = automationState;
  }
}

/**
 * Read basic parameter info (id and name only)
 * @param {object} paramApi - LiveAPI parameter object
 * @returns {object} Parameter info with id and name
 */
export function readParameterBasic(paramApi) {
  const name = formatParamName(paramApi);

  return { id: paramApi.id, name };
}

/**
 * Read a single device parameter with full details.
 * @param {object} paramApi - LiveAPI parameter object
 * @returns {object} Parameter info object
 */
export function readParameter(paramApi) {
  const name = formatParamName(paramApi);
  const state = PARAM_STATE_MAP[paramApi.getProperty("state")];
  const automationState =
    AUTOMATION_STATE_MAP[paramApi.getProperty("automation_state")];

  if (paramApi.getProperty("is_quantized") > 0) {
    const valueItems = paramApi.get("value_items");
    const result = {
      id: paramApi.id,
      name,
      value: valueItems[paramApi.getProperty("value")],
      options: valueItems,
    };

    addStateFlags(result, paramApi, state, automationState);

    return result;
  }

  const rawValue = paramApi.getProperty("value");
  const rawMin = paramApi.getProperty("min");
  const rawMax = paramApi.getProperty("max");
  const valueLabel = paramApi.call("str_for_value", rawValue);
  const minLabel = paramApi.call("str_for_value", rawMin);
  const maxLabel = paramApi.call("str_for_value", rawMax);

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
  const unit = valueParsed.unit || minParsed.unit || maxParsed.unit;

  if (unit === "pan") {
    const maxPanValue =
      extractMaxPanValue(maxLabel) || extractMaxPanValue(minLabel) || 50;
    const result = {
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

  const result = {
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
