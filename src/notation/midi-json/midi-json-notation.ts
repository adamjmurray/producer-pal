// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MIDI JSON notation: a JSON array of {@link CodeNote} objects (camelCase,
 * musical beats) — close to the raw Live API note interface but shaped for the
 * REST/MCP surface. interpret parses the JSON into the interpreter's internal
 * `NoteEvent`; format serializes `NoteEvent`s back to a JSON string. Both are the
 * MIDI JSON counterparts to barbeat's interpret/format seams.
 */

import {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
  validateCodeNotes,
} from "#src/notation/midi-json/midi-json-note.ts";
import { type NoteEvent } from "#src/notation/types.ts";

const DEFAULT_DENOMINATOR = 4;

/** Options for the MIDI JSON interpret/format seams. */
export interface MidiJsonOptions {
  /** Clip time-signature denominator (musical-beat scaling). Defaults to 4. */
  timeSigDenominator?: number;
}

/**
 * Parse a MIDI JSON string into note events. The JSON must be an array of note
 * objects; each is validated and clamped by {@link validateCodeNotes}, then
 * scaled from musical beats to Ableton (quarter-note) beats.
 *
 * @param jsonString - JSON array of CodeNote objects
 * @param options - Interpretation options
 * @returns Array of note events
 * @throws If the string is not valid JSON or not an array of notes
 */
export function interpretMidiJson(
  jsonString: string,
  options: MidiJsonOptions = {},
): NoteEvent[] {
  if (!jsonString.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Invalid MIDI JSON: ${message}`, { cause: error });
  }

  const validated = validateCodeNotes(parsed);

  if (!validated.success) {
    throw new Error(`Invalid MIDI JSON: ${validated.error}`);
  }

  const timeSigDenominator = options.timeSigDenominator ?? DEFAULT_DENOMINATOR;

  return validated.notes.map((note) =>
    codeNoteToNoteEvent(note, timeSigDenominator),
  );
}

/**
 * Serialize note events into a MIDI JSON string (array of CodeNote objects in
 * musical beats). Inverse of {@link interpretMidiJson}.
 *
 * @param notes - Note events to serialize
 * @param options - Format options
 * @returns JSON string, or "" when there are no notes
 */
export function formatMidiJson(
  notes: NoteEvent[],
  options: MidiJsonOptions = {},
): string {
  if (notes.length === 0) {
    return "";
  }

  const timeSigDenominator = options.timeSigDenominator ?? DEFAULT_DENOMINATOR;

  return JSON.stringify(
    notes.map((note) => noteEventToCodeNote(note, timeSigDenominator)),
  );
}
