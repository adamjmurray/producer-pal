// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface LabelPattern {
  regex: RegExp;
  /** null for a shape that is a number but carries no unit, like a ratio. */
  unit: string | null;
  /** Scales the matched number onto the unit; 1 when left out. */
  multiplier?: number;
  fixedValue?: number;
  isNoteName?: boolean;
  isPan?: boolean;
}

// A bare "k" means thousands and says nothing about what is measured: Analog's
// filter frequencies read "999", then "1.00k". It must come after "khz".
const BARE_THOUSANDS = /^([\d.]+)\s*k$/i;

/**
 * Whether text is a number with a bare "k" suffix, like "22.0k".
 * @param text - Trimmed text to check
 * @returns True if it is a number of thousands with no unit
 */
export function isBareThousands(text: string): boolean {
  return BARE_THOUSANDS.test(text);
}

/**
 * Label parsing patterns for extracting values and units from display labels.
 * Order matters - more specific patterns should come before general ones.
 */
const LABEL_PATTERNS: LabelPattern[] = [
  // ms must precede s so "100ms" doesn't match the s-only pattern
  { regex: /^([\d.]+)\s*khz$/i, unit: "Hz", multiplier: 1000 },
  { regex: /^([\d.]+)\s*hz$/i, unit: "Hz" },
  { regex: BARE_THOUSANDS, unit: null, multiplier: 1000 },
  { regex: /^([\d.]+)\s*ms$/i, unit: "ms" },
  { regex: /^([\d.]+)\s*s$/i, unit: "ms", multiplier: 1000 },
  { regex: /^([\d.-]+)\s*db$/i, unit: "dB" },
  { regex: /^(-?inf)\s*db$/i, unit: "dB", fixedValue: -70 },
  { regex: /^([\d.-]+)\s*(?:%|percent)$/i, unit: "%" },
  {
    regex: /^([\d.-]+)\s*(?:°|deg|degrees?)$/i,
    unit: "degrees",
  },
  // Live writes decimals on every one of these: "-1.68 st", "0.00 st".
  {
    regex: /^([+-]?[\d.]+)\s*(?:st|semis?|semitones?)$/i,
    unit: "semitones",
  },
  // Cents stay cents. They are hundredths of a semitone, but a param displays
  // one or the other and a write is converted onto the scale the param shows,
  // so folding them together would rescale every write to a cents param.
  {
    regex: /^([+-]?[\d.]+)\s*(?:ct|cents?)$/i,
    unit: "cents",
  },
  // Steps of the current scale, not of the chromatic one, so this is neither
  // semitones nor dimensionless (Auto Shift "Pitch Scale Deg.", Resonators).
  {
    regex: /^([+-]?[\d.]+)\s*(?:sd|scale ?degrees?)$/i,
    unit: "scale degrees",
  },
  // Ratios. Live writes compression as "4.00 : 1" and expansion as "1 : 1.15",
  // so the number that means anything is whichever side isn't the 1. An end
  // like "inf : 1" matches neither and is left to the sentinel trim.
  { regex: /^([\d.]+)\s*:\s*1(?:\.0+)?$/, unit: null },
  { regex: /^1(?:\.0+)?\s*:\s*([\d.]+)$/, unit: null },
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
 * for a label that is a bare number (EQ Eight `Q`, Glue Compressor `Attack`),
 * and an uncoerced number silently fails `parseLabel`'s type guard — which
 * drops the param back to raw units on both the read and the write path.
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

    if (!match) {
      continue;
    }

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

    if (unit != null) {
      return unit;
    }
  }

  return null;
}

/** Off/On labels a two-option param plausibly uses for a toggle. */
const OFF_LABELS = new Set(["off", "false", "0"]);
const ON_LABELS = new Set(["on", "true", "1"]);

/**
 * The index an enum (quantized) param's value_items resolves to for an input
 * value, or -1 if none does.
 *
 * Tried in order, first hit wins:
 * 1. The written text, then the normalized value, ignoring case. Written text
 *    comes first because normalizing strips units ("24 dB" becomes 24).
 * 2. The one option with the same number and unit ("12 dB" on "12dB"); a bare
 *    number matches any unit ("24" on "24 dB").
 * 3. The one option that differs only in case, spacing or a hyphen between
 *    words ("Mid / Side", "Lowpass").
 * 4. For an Off/On pair, the `false`/`0` and `true`/`1` a model sends for a
 *    toggle.
 * Two options matching at one step make the text ambiguous, so it is refused.
 * @param valueItems - The param's value_items, in index order. Max returns a
 *   numeric label (e.g. 1, 2) as a number, so a list can mix numbers and strings.
 * @param inputValue - The value to resolve, as normalizeParamValue left it
 * @param writtenText - The value as the caller wrote it; defaults to inputValue
 * @returns The matching index, or -1 if nothing matches
 */
export function resolveEnumIndex(
  valueItems: (string | number)[],
  inputValue: string | number,
  writtenText: string = String(inputValue),
): number {
  const lower = valueItems.map((item) => String(item).toLowerCase());
  const wanted = [
    ...new Set([writtenText.toLowerCase(), String(inputValue).toLowerCase()]),
  ];

  for (const candidate of wanted) {
    const exact = lower.indexOf(candidate);

    if (exact !== -1) {
      return exact;
    }
  }

  const unitIndex = indexOfUnitLabelled(valueItems, writtenText);

  if (unitIndex !== -1) {
    return unitIndex;
  }

  const looseIndex = indexOfLooseLabel(valueItems, writtenText);

  if (looseIndex !== -1) {
    return looseIndex;
  }

  const offIndex = lower.indexOf("off");
  const onIndex = lower.indexOf("on");

  if (valueItems.length !== 2 || offIndex === -1 || onIndex === -1) {
    return -1;
  }

  if (wanted.some((candidate) => OFF_LABELS.has(candidate))) {
    return offIndex;
  }

  if (wanted.some((candidate) => ON_LABELS.has(candidate))) {
    return onIndex;
  }

  return -1;
}

/**
 * A label with case and whitespace removed, plus any hyphen that joins two
 * words ("Low-pass" is "lowpass"), so "Mid / Side" and "Mid/Side" compare equal.
 * A hyphen that is a minus sign ("-6") stays: dropping it would turn -6 into 6.
 * @param label - A display label or what the caller wrote
 * @returns The key to compare labels by
 */
export function looseLabelKey(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/\s+/g, "")
    .replaceAll(/(?<=[\p{L}\p{N}&])-(?=[\p{L}&])/gu, "");
}

/**
 * The one option that matches what the caller wrote under `looseLabelKey`. Two
 * options with the same key make the text ambiguous, so none is picked.
 * @param valueItems - The param's value_items
 * @param writtenText - The value as the caller wrote it
 * @returns The option's index, or -1 if none or several match
 */
function indexOfLooseLabel(
  valueItems: (string | number)[],
  writtenText: string,
): number {
  const wanted = looseLabelKey(writtenText);
  const matches: number[] = [];

  for (const [index, item] of valueItems.entries()) {
    if (looseLabelKey(String(item)) === wanted) {
      matches.push(index);
    }
  }

  return matches.length === 1 ? (matches[0] as number) : -1;
}

/**
 * The one option whose label is a number with a unit and that equals what the
 * caller wrote. A bare number matches any unit; a number with a unit must match
 * the unit too, ignoring spacing, case and scale ("0.8 kHz" is "800 Hz").
 * @param valueItems - The param's value_items
 * @param writtenText - The value as the caller wrote it
 * @returns The option's index, or -1 if the text isn't a number or no single
 *   option matches
 */
function indexOfUnitLabelled(
  valueItems: (string | number)[],
  writtenText: string,
): number {
  const trimmed = writtenText.trim();
  const bare = trimmed === "" ? Number.NaN : Number(trimmed);
  const written: ParsedLabel = Number.isFinite(bare)
    ? { value: bare, unit: null }
    : parseLabel(trimmed);

  if (written.value == null) {
    return -1;
  }

  const matches: number[] = [];

  for (const [index, item] of valueItems.entries()) {
    const parsed = parseLabel(String(item));

    if (
      parsed.unit != null &&
      (written.unit == null || written.unit === parsed.unit) &&
      parsed.direction === written.direction &&
      sameValue(parsed.value, written.value)
    ) {
      matches.push(index);
    }
  }

  return matches.length === 1 ? (matches[0] as number) : -1;
}

function sameValue(a: number | string | null, b: number | string): boolean {
  if (typeof a === "number" && typeof b === "number") {
    // Scaling "1.1 kHz" by 1000 isn't exact
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  }

  return a === b;
}
