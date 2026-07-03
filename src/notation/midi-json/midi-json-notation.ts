// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MIDI JSON notation: a compact array of note objects (musical beats) — close to
 * the raw Live API note interface but shaped for the REST/MCP surface.
 *
 * The serialized form is a JS object-literal (unquoted keys, no inner escaping)
 * with short keys and defaults omitted, e.g.
 * `[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]`. Keys: `p` pitch,
 * `t` start, `d` duration, `v` velocity, `vd` velocity-deviation (omitted at 0),
 * `c` probability/chance (omitted at 1). interpret parses via a small Peggy
 * grammar (not eval) into the interpreter's internal `NoteEvent`; format
 * serializes back to the literal. Both are the MIDI JSON counterparts to
 * barbeat's interpret/format seams.
 */

import {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
  validateAndSanitizeNote,
} from "#src/notation/midi-json/midi-json-note.ts";
import {
  type MidiJsonRawNote,
  parse as parseMidiJson,
} from "#src/notation/midi-json/parser/midi-json-parser.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

const DEFAULT_DENOMINATOR = 4;

// Largest denominator {@link findExactRatio} will spell (covers common tuplets:
// triplets, quintuplets, sextuplets, septuplets, and their compounds).
const MAX_RATIO_DENOMINATOR = 16;

/** Options for the MIDI JSON interpret/format seams. */
export interface MidiJsonOptions {
  /** Clip time-signature denominator (musical-beat scaling). Defaults to 4. */
  timeSigDenominator?: number;
}

/**
 * Parse a MIDI JSON string into note events. The string must be an array of note
 * objects (short or long keys, quoted or bare); each is normalized, validated,
 * and clamped, then scaled from musical beats to Ableton (quarter-note) beats.
 *
 * @param input - MIDI JSON array string
 * @param options - Interpretation options
 * @returns Array of note events
 * @throws If the string is not a valid MIDI JSON array
 */
export function interpretMidiJson(
  input: string,
  options: MidiJsonOptions = {},
): NoteEvent[] {
  if (!input.trim()) {
    return [];
  }

  let parsed: MidiJsonRawNote[];

  try {
    parsed = parseMidiJson(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Invalid MIDI JSON: ${message}`, { cause: error });
  }

  const timeSigDenominator = options.timeSigDenominator ?? DEFAULT_DENOMINATOR;
  const events: NoteEvent[] = [];

  for (const raw of parsed) {
    const validated = validateAndSanitizeNote(normalizeMidiJsonNote(raw));

    if (validated.valid) {
      events.push(codeNoteToNoteEvent(validated.note, timeSigDenominator));
    }
    // Invalid notes (e.g. missing pitch/start) are silently filtered out.
  }

  return events;
}

/**
 * Serialize note events into a MIDI JSON string (a JS object-literal array in
 * musical beats). Inverse of {@link interpretMidiJson}: uses short keys, omits
 * `vd`/`c` at their defaults (0/1), and trims floats to at most 4 decimals.
 *
 * @param notes - Note events to serialize
 * @param options - Format options
 * @returns MIDI JSON string, or "" when there are no notes
 */
export function formatMidiJson(
  notes: NoteEvent[],
  options: MidiJsonOptions = {},
): string {
  if (notes.length === 0) {
    return "";
  }

  const timeSigDenominator = options.timeSigDenominator ?? DEFAULT_DENOMINATOR;

  const objects = notes.map((note) => {
    const codeNote = noteEventToCodeNote(note, timeSigDenominator);

    const fields = [
      `p:${codeNote.pitch}`,
      `t:${formatBeats(codeNote.start)}`,
      `d:${formatBeats(codeNote.duration)}`,
      `v:${codeNote.velocity}`,
    ];

    if (codeNote.velocityDeviation !== 0) {
      fields.push(`vd:${codeNote.velocityDeviation}`);
    }

    if (codeNote.probability !== 1) {
      fields.push(`c:${trimFloat(codeNote.probability)}`);
    }

    return `{${fields.join(",")}}`;
  });

  return `[${objects.join(",")}]`;
}

/**
 * Map a raw parsed note (short or long keys) to the CodeNote-shaped object
 * expected by {@link validateAndSanitizeNote}. Short keys win over long keys;
 * both the new `deviation` long key and the legacy `velocityDeviation` are
 * accepted. Missing keys stay undefined so downstream defaulting applies.
 *
 * @param raw - Raw note object from the parser
 * @returns CodeNote-shaped object (values may be undefined)
 */
function normalizeMidiJsonNote(
  raw: MidiJsonRawNote,
): Record<string, number | undefined> {
  return {
    pitch: raw.p ?? raw.pitch,
    start: raw.t ?? raw.start,
    duration: raw.d ?? raw.duration,
    velocity: raw.v ?? raw.velocity,
    velocityDeviation: raw.vd ?? raw.velocityDeviation ?? raw.deviation,
    probability: raw.c ?? raw.probability,
  };
}

/**
 * Format a number with at most 4 decimals, trimming trailing zeros. 4 decimals
 * is 10× under the 0.001 same-time tolerance, so it never introduces
 * round-trip drift collisions.
 *
 * @param value - Number to format
 * @returns Compact string form
 */
function trimFloat(value: number): string {
  return String(Number.parseFloat(value.toFixed(4)));
}

/**
 * Format a timing value (start or duration, in musical beats), preferring an
 * exact `p/q` ratio for tuplets. When the 4-decimal form is already exact (every
 * integer, half, quarter, 0.1, …) it is kept — so ordinary values never change.
 * Only a value whose decimal is LOSSY (a repeating tuplet like 1/3) is spelled
 * as a fraction, and only when a small exact one exists — so a triplet round-trips
 * exactly instead of drifting through `d:0.3333`.
 *
 * @param value - Timing value in musical beats
 * @returns The decimal string, or an exact `p/q` ratio for tuplets
 */
function formatBeats(value: number): string {
  const decimal = trimFloat(value);

  if (Number.parseFloat(decimal) === value) {
    return decimal;
  }

  return findExactRatio(value) ?? decimal;
}

/**
 * Find the smallest-denominator ratio `p/q` (q up to {@link
 * MAX_RATIO_DENOMINATOR}) that equals `value` within same-time tolerance, or
 * null if none does. Ascending `q` yields the reduced fraction; the tolerance
 * lets a device-jittered read-back (e.g. 0.33333334) still snap to `1/3`.
 *
 * @param value - Timing value in musical beats
 * @returns The exact ratio string, or null when no small fraction matches
 */
function findExactRatio(value: number): string | null {
  for (let den = 2; den <= MAX_RATIO_DENOMINATOR; den++) {
    const num = value * den;

    if (Math.abs(num - Math.round(num)) < SAME_TIME_EPSILON) {
      return `${Math.round(num)}/${den}`;
    }
  }

  return null;
}
