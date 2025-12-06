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

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

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
      const num = parseInt(match[1]);
      const dir = match[2];
      return { value: num, unit: "pan", direction: dir };
    }

    return {
      value: parseFloat(match[1]) * (pattern.multiplier || 1),
      unit: pattern.unit,
    };
  }

  // No unit detected - try to extract just a number
  const numMatch = label.match(/^([\d.-]+)/);
  if (numMatch) {
    return { value: parseFloat(numMatch[1]), unit: null };
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
 * Normalize pan value to -1 to 1 range.
 * @param {string} label - Pan label (e.g., "50L", "C", "50R")
 * @param {number} maxPanValue - Maximum pan value (e.g., 50)
 * @returns {number} Normalized pan value (-1 to 1)
 */
export function normalizePan(label, maxPanValue) {
  if (label === "C") return 0;

  const match = label.match(/^(\d+)([LR])$/);
  if (!match) return 0;

  const num = parseInt(match[1]);
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
  return match ? parseInt(match[1]) : 50;
}

/**
 * Convert MIDI note number to note name.
 * @param {number} midi - MIDI note number (0-127)
 * @returns {string} Note name (e.g., "C4", "F#-1")
 */
export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 2;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

/**
 * Convert note name to MIDI note number.
 * @param {string} name - Note name (e.g., "C4", "F#-1", "Db3")
 * @returns {number|null} MIDI note number or null if invalid
 */
export function noteNameToMidi(name) {
  const match = name.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) return null;

  const [, letter, accidental, octave] = match;
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
  const modifier = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;

  return semitones + modifier + (parseInt(octave) + 2) * 12;
}

/**
 * Check if a string is a valid note name.
 * @param {string} value - Value to check
 * @returns {boolean} True if valid note name
 */
export function isNoteName(value) {
  return typeof value === "string" && /^[A-G][#b]?-?\d+$/.test(value);
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
  const name = paramApi.getProperty("name");
  const originalName = paramApi.getProperty("original_name");
  const result = { id: paramApi.id, name };
  if (originalName !== name) result.originalName = originalName;
  return result;
}

/**
 * Read a single device parameter with full details.
 * @param {object} paramApi - LiveAPI parameter object
 * @returns {object} Parameter info object
 */
export function readParameter(paramApi) {
  const name = paramApi.getProperty("name");
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
