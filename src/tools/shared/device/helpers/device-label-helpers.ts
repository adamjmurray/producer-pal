// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
  {
    regex: /^([+-]?\d+)\s*(?:st|semis?|semitones?)$/i,
    unit: "semitones",
    multiplier: 1,
  },
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
  const numMatch = trimmed.match(/^([\d.-]+)/);

  if (numMatch) {
    return {
      value: Number.parseFloat(numMatch[1] as string),
      unit: null,
    };
  }

  return { value: null, unit: null };
}
