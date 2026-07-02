// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark serializer: converts NoteEvent[] into a Stark string. Round-trip
 * (interpret → serialize → interpret) is a fixed point on note ONSETS, modulo
 * the documented lossy axes: velocity bucketing, drum note-length, and any
 * off-16th onset (snapped to a 16th grid — the same axis abstark documents).
 *
 * Pitched (bass/melody/chords) lines are identical to abstark, so they reuse
 * abstark's `serializePitched` verbatim (A/B scaffolding — collapses when
 * abstark is deleted post-eval). Only the drum serializer differs: stark drums
 * are event-based, so each line picks the coarsest grid (quarter → eighth →
 * sixteenth) that lands every onset, then emits one hit/`z` token per step.
 */

import {
  drumChar,
  drumHeader,
  groupNotesByPitch,
  serializePitched,
} from "#src/notation/abstark/abstark-serializer.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** Options for {@link formatNotation}. */
export interface StarkFormatOptions {
  /**
   * True when the clip's track has a Drum Rack instrument. It — not the MIDI
   * pitch — decides drum vs. pitched serialization (see abstark-serializer).
   */
  drumMode?: boolean;
}

/**
 * Serialize MIDI note events into a Stark notation string.
 * @param notes - Note events to serialize
 * @param options - Serialization options (notably `drumMode`)
 * @returns Stark string, or "" when there are no serializable notes
 */
export function formatNotation(
  notes: NoteEvent[],
  options: StarkFormatOptions = {},
): string {
  if (notes.length === 0) return "";

  if (options.drumMode) {
    return serializeStarkDrums(notes).join("\n");
  }

  return serializePitched(notes);
}

// Grid choices for a drum line, coarse → fine. Never coarser than a quarter: a
// bar with a single kick reads as `kick: X` (not `/1: X`), and half-note spacing
// uses quarter-grid rests (`kick: X z X`). Off-grid onsets fall back to /16.
const DRUM_GRID_NS = [4, 8, 16] as const;

// Serialize drum notes into one `<header> [/N]: <tokens>` line per pitch.
function serializeStarkDrums(notes: NoteEvent[]): string[] {
  const lines: string[] = [];

  for (const [pitch, pitchNotes] of groupNotesByPitch(notes)) {
    const sorted = [...pitchNotes].sort((a, b) => a.start_time - b.start_time);
    const n = chooseLineDefaultN(sorted);
    const step = 4 / n;
    const lastOnset = sorted.at(-1)?.start_time ?? 0;
    const stepCount = Math.round(lastOnset / step) + 1;

    const charAt = new Map<number, string>();

    for (const note of sorted) {
      charAt.set(Math.round(note.start_time / step), drumChar(note.velocity));
    }

    const tokens: string[] = [];

    for (let i = 0; i < stepCount; i++) {
      tokens.push(charAt.get(i) ?? "z");
    }

    // /N header only when the grid is finer than the /4 default.
    const header = n === 4 ? drumHeader(pitch) : `${drumHeader(pitch)} /${n}`;

    lines.push(`${header}: ${tokens.join(" ")}`);
  }

  return lines;
}

// Coarsest grid in {4, 8, 16} whose step length divides every onset; /16 when
// none does (off-grid content snaps to the 16th grid — a documented lossy axis).
function chooseLineDefaultN(notes: NoteEvent[]): number {
  for (const n of DRUM_GRID_NS) {
    const step = 4 / n;
    const fits = notes.every((note) => {
      const snapped = Math.round(note.start_time / step) * step;

      return Math.abs(note.start_time - snapped) < SAME_TIME_EPSILON;
    });

    if (fits) return n;
  }

  return 16;
}
