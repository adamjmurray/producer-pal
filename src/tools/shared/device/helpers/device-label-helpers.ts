// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface LabelPattern {
  regex: RegExp;
  /** null for a shape that is a number but carries no unit, like a ratio. */
  unit: string | null;
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
  // ms must precede s so "100ms" doesn't match the s-only pattern
  { regex: /^([\d.]+)\s*khz$/i, unit: "Hz", multiplier: 1000 },
  { regex: /^([\d.]+)\s*hz$/i, unit: "Hz", multiplier: 1 },
  { regex: /^([\d.]+)\s*ms$/i, unit: "ms", multiplier: 1 },
  { regex: /^([\d.]+)\s*s$/i, unit: "ms", multiplier: 1000 },
  { regex: /^([\d.-]+)\s*db$/i, unit: "dB", multiplier: 1 },
  { regex: /^(-?inf)\s*db$/i, unit: "dB", fixedValue: -70 },
  { regex: /^([\d.-]+)\s*(?:%|percent)$/i, unit: "%", multiplier: 1 },
  {
    regex: /^([\d.-]+)\s*(?:°|deg|degrees?)$/i,
    unit: "degrees",
    multiplier: 1,
  },
  // Live writes decimals on every one of these: "-1.68 st", "0.00 st".
  {
    regex: /^([+-]?[\d.]+)\s*(?:st|semis?|semitones?)$/i,
    unit: "semitones",
    multiplier: 1,
  },
  // Cents stay cents. They are hundredths of a semitone, but a param displays
  // one or the other and a write is converted onto the scale the param shows,
  // so folding them together would rescale every write to a cents param.
  {
    regex: /^([+-]?[\d.]+)\s*(?:ct|cents?)$/i,
    unit: "cents",
    multiplier: 1,
  },
  // Steps of the current scale, not of the chromatic one, so this is neither
  // semitones nor dimensionless (Auto Shift "Pitch Scale Deg.", Resonators).
  {
    regex: /^([+-]?[\d.]+)\s*(?:sd|scale ?degrees?)$/i,
    unit: "scale degrees",
    multiplier: 1,
  },
  // Ratios. Live writes compression as "4.00 : 1" and expansion as "1 : 1.15",
  // so the number that means anything is whichever side isn't the 1. An end
  // like "inf : 1" matches neither and is left to the sentinel trim.
  { regex: /^([\d.]+)\s*:\s*1(?:\.0+)?$/, unit: null, multiplier: 1 },
  { regex: /^1(?:\.0+)?\s*:\s*([\d.]+)$/, unit: null, multiplier: 1 },
  { regex: /^([a-g][#b]?-?\d+)$/i, unit: "note", isNoteName: true },
  { regex: /^(\d+)([lr])$/i, unit: "pan", isPan: true },
  { regex: /^(c)$/i, unit: "pan", fixedValue: 0 },
];

export interface ParsedLabel {
  value: number | string | null;
  unit: string | null;
  direction?: string;
}

/**
 * Read a parameter's display label. Always call this instead of
 * `param.call("str_for_value", ...)`: Max hands back a JS number, not a string,
 * whenever the label is a bare number with no unit or suffix (EQ Eight `Q`, Glue
 * Compressor `Attack`). Every consumer here wants a string, and an uncoerced
 * number silently fails `parseLabel`'s type guard, which drops the param back to
 * raw units on both the read and the write path.
 * @param paramApi - LiveAPI parameter object
 * @param rawValue - Raw value to render
 * @returns The display label
 */
export function strForValue(paramApi: LiveAPI, rawValue: number): string {
  return String(paramApi.call("str_for_value", rawValue));
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

  // VST plugins like Serum right-pad numeric values (e.g. "    8 Hz")
  const trimmed = label.trim();

  for (const pattern of LABEL_PATTERNS) {
    const match = trimmed.match(pattern.regex);

    if (!match) continue;

    if (pattern.fixedValue != null) {
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

    return numberOrNothing(
      Number.parseFloat(match[1] as string) * (pattern.multiplier ?? 1),
      pattern.unit,
    );
  }

  // No unit detected - try to extract just a number. A colon means a ratio the
  // patterns above didn't recognize ("inf : 1"), and taking its leading number
  // would report the wrong side of the ratio as the value.
  const numMatch = trimmed.includes(":") ? null : trimmed.match(/^([\d.-]+)/);

  if (numMatch) {
    return numberOrNothing(Number.parseFloat(numMatch[1] as string), null);
  }

  return { value: null, unit: null };
}

/**
 * Never let a NaN out of parseLabel. Several patterns accept a bare "-" or "."
 * where a number belongs ("-dB", ".Hz"), and the no-unit fallback matches any
 * run of digits, dots and hyphens ("---"). Every comparison against NaN is
 * false, so a NaN reaching the display search walks a param to full scale and
 * reports success. An unparseable label is no label at all.
 * @param value - The parsed number, possibly NaN
 * @param unit - The unit the pattern matched, if any
 * @returns The parsed label, or an empty one if the number isn't finite
 */
function numberOrNothing(value: number, unit: string | null): ParsedLabel {
  return Number.isFinite(value) ? { value, unit } : { value: null, unit: null };
}

/**
 * The unit a parameter displays in, read from its own labels. Tries each label
 * in turn so a parameter whose current value is a word (Glue Compressor's
 * Release reads "A") still reports the unit its range carries. Returns null
 * when the parameter displays a bare number — there is nothing to check a
 * written unit against.
 * @param labels - The parameter's labels, most representative first
 * @returns The unit, or null if no label carries one
 */
export function unitForLabels(...labels: string[]): string | null {
  for (const label of labels) {
    const { unit } = parseLabel(label);

    if (unit != null) return unit;
  }

  return null;
}
