// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading a clip's notes back for grading, in midi-json so the check never
 * touches the notation the model happened to write in.
 */

import { interpretMidiJson } from "#src/notation/midi-json/midi-json-notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Parse a read-clip result (read back in midi-json) into notes.
 * @param result - The ppal-read-clip result
 * @returns The clip's notes, or null when missing or unparseable
 */
export function readbackNotes(result: unknown): NoteEvent[] | null {
  const clip = result as { notes?: unknown };

  if (typeof clip.notes !== "string") {
    return null;
  }

  try {
    return interpretMidiJson(clip.notes);
  } catch {
    return null;
  }
}
