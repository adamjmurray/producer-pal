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

const DEFAULT_DENOMINATOR = 4;

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
      `t:${trimFloat(codeNote.start)}`,
      `d:${trimFloat(codeNote.duration)}`,
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
