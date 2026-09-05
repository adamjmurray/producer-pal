// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseLabel } from "./helpers/device-label-helpers.ts";

/**
 * A unit Live knows but never reports. `DeviceParameter` exposes no unit at
 * all, and a good number of Live's stock params display a bare number,
 * so the only way to know what they measure is to record it here.
 */
export interface KnownParamUnit {
  /** The unit as read-device reports it and a write may spell it. */
  unit: string;
  /** The display range when this was recorded. */
  min: number;
  max: number;
}

// Only params whose labels are genuinely bare belong here. A param that prints
// its unit is parseLabel's job — check `str_for_value` before adding a row.
//
// Adding an entry: get the unit from Live's UI (hover a control and its Info
// View names the unit in prose; the API never returns one), then record the
// range read-device prints for it. A range that no longer matches drops the
// entry, so the range is part of the key.
//
// Deliberately absent: Hybrid Reverb's and Roar's Blend, which read "57/43" —
// a ratio between two sections, not a quantity. Live names no unit for either.
// Also absent: every 0.5-9 bandwidth control. Live names no unit for any of
// them, and they are not Erosion's `Filter Width`, which is octaves over
// 0.1-2.5 — Beat Repeat, Delay, Filter Delay and Overdrive `Filter Width`,
// Corpus `Width`, Reverb `Input Width`, Roar `FB Width` and `Env Width`.
// See dev/Device-Param-Labels.md.
const KNOWN_UNITS: Record<string, Record<string, KnownParamUnit>> = {
  Corpus: {
    "LFO Rate": { unit: "Hz", min: 0.01, max: 10 },
    Tune: { unit: "Hz", min: 16.35, max: 4186 },
  },
  Erosion: {
    "Filter Width": { unit: "octaves", min: 0.1, max: 2.5 },
  },
  "Glue Compressor": {
    Attack: { unit: "ms", min: 0.01, max: 30 },
    // Seconds, where Attack is milliseconds. Writing either spelling to either
    // param works — the value is converted onto the param's own scale.
    Release: { unit: "s", min: 0.1, max: 1.2 },
  },
  Redux: {
    "Post-Filter": { unit: "octaves", min: -4, max: 4 },
  },
  Resonators: resonatorTuneEntries(),
  Reverb: {
    "Stereo Image": { unit: "degrees", min: 0, max: 120 },
  },
};

/**
 * The five resonators carry the same fine-tune control, so name them once.
 * @returns The Tune entry for each resonator, keyed by param name
 */
function resonatorTuneEntries(): Record<string, KnownParamUnit> {
  const tune: KnownParamUnit = { unit: "cents", min: -50, max: 50 };

  return Object.fromEntries(
    ["I", "II", "III", "IV", "V"].map((numeral) => [`${numeral} Tune`, tune]),
  );
}

/**
 * The recorded unit for a parameter, or null if there isn't one.
 *
 * The range is part of the key, not just the value: a Live version that moves a
 * param's range has changed what the control does, and reporting the old unit
 * for it would be worse than reporting none. A mismatch drops the entry.
 * @param deviceName - The device's class_display_name
 * @param paramName - The parameter's name
 * @param minValue - The parameter's current display minimum
 * @param maxValue - The parameter's current display maximum
 * @returns The recorded unit, or null if none applies
 */
export function knownParamUnit(
  deviceName: string | undefined,
  paramName: string,
  minValue: number,
  maxValue: number,
): KnownParamUnit | null {
  const entry = lookupEntry(deviceName, paramName);

  if (entry == null) return null;

  return sameEnd(entry.min, minValue) && sameEnd(entry.max, maxValue)
    ? entry
    : null;
}

/**
 * The raw entry for a param, with no range check — just "is there a recorded
 * unit at all". `knownParamUnit` layers the range check on top for anything
 * that reads a value; this is for deciding whether a written string is even
 * worth treating as this param's unit before a range is known.
 *
 * The param name matches case-insensitively, same as `resolveParamsByName` —
 * a caller can write "filter width" and still hit the param `resolveParamsByName`
 * resolves it to. `deviceName` doesn't need this: it's always read from
 * `class_display_name`, never typed by a caller, so its case is stable.
 * @param deviceName - The device's class_display_name
 * @param paramName - The parameter's name
 * @returns The recorded entry, or undefined if there isn't one
 */
function lookupEntry(
  deviceName: string | undefined,
  paramName: string,
): KnownParamUnit | undefined {
  const params = deviceName == null ? undefined : KNOWN_UNITS[deviceName];

  if (params == null) return undefined;

  const nameLower = paramName.toLowerCase();
  const key = Object.keys(params).find((k) => k.toLowerCase() === nameLower);

  return key == null ? undefined : params[key];
}

/**
 * The spelling of a param's recorded unit, ignoring the range check —
 * `normalizeParamValue` calls this before a param (and its current range) is
 * resolved, just to decide whether a trailing word is worth matching at all.
 * @param deviceName - The device's class_display_name
 * @param paramName - The parameter's name
 * @returns The recorded unit's spelling, or null if none is recorded
 */
export function recordedUnitSpelling(
  deviceName: string | undefined,
  paramName: string,
): string | null {
  return lookupEntry(deviceName, paramName)?.unit ?? null;
}

/**
 * The recorded unit for a param, or null when there isn't one to apply.
 *
 * Live's own labels always win: a param that states its unit needs no lookup,
 * and one with no numeric range has nothing to match a recorded range against.
 * @param labelUnit - The unit the param's own labels carry, if any
 * @param range - The param's display range, if it has one
 * @param deviceName - The device's class_display_name
 * @param paramName - The parameter's name
 * @returns The recorded unit, or null if none applies
 */
export function recordedUnitFor(
  labelUnit: string | null,
  range: { minValue: number; maxValue: number } | null,
  deviceName: string | undefined,
  paramName: string,
): KnownParamUnit | null {
  if (labelUnit != null || range == null) return null;

  return knownParamUnit(deviceName, paramName, range.minValue, range.maxValue);
}

/**
 * The unit `parseLabel` folds a spelling into, and how much it scales by.
 * Seconds report `{ canonical: "ms", scale: 1000 }` because parseLabel converts
 * them; a spelling parseLabel doesn't know (octaves) stands for itself.
 *
 * Derived by running parseLabel rather than by listing conversions again, so
 * this can't drift from the parser it has to agree with.
 * @param unit - The unit to canonicalize
 * @returns The canonical unit and the factor to divide a canonical value by
 */
export function canonicalUnit(unit: string): {
  canonical: string;
  scale: number;
} {
  const parsed = parseLabel(`1${unit}`);

  return typeof parsed.value === "number" && parsed.unit != null
    ? { canonical: parsed.unit, scale: parsed.value }
    : { canonical: unit, scale: 1 };
}

/**
 * Split a written value into a leading number and whatever text follows it.
 * Used to compare a written unit spelling against a param's own recorded one
 * when `parseLabel` doesn't know it — the recorded spelling stands for itself.
 * @param text - The text to split, e.g. "1.5 octaves"
 * @returns The number and trimmed trailing text, or null with no leading number
 */
export function splitLeadingNumber(
  text: string,
): { value: number; trailing: string } | null {
  const match = text.trim().match(/^([+-]?[\d.]+)\s*(.*)$/);

  if (match == null) return null;

  const value = Number.parseFloat(match[1] as string);

  return Number.isFinite(value)
    ? { value, trailing: (match[2] as string).trim() }
    : null;
}

/**
 * Whether a recorded range end still matches the one Live reports. Live prints
 * these as display labels, so they arrive as the same short decimals that were
 * recorded; the tolerance only absorbs float noise.
 * @param recorded - The end recorded in the table
 * @param observed - The end Live reports now
 * @returns True if they are the same value
 */
function sameEnd(recorded: number, observed: number): boolean {
  return (
    Math.abs(recorded - observed) <= 1e-6 * Math.max(1, Math.abs(recorded))
  );
}
