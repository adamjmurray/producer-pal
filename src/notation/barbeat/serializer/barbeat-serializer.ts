// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sortNotes } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { isValidMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { formatDrumNotation } from "./helpers/barbeat-serializer-drum.ts";
import { formatBeatPosition } from "./helpers/barbeat-serializer-fractions.ts";
import {
  type FormatOptions,
  groupNotesByTime,
  resolveFormatConfig,
} from "./helpers/barbeat-serializer-grouping.ts";
import { findMergeBatches } from "./helpers/barbeat-serializer-merge.ts";
import {
  createInitialState,
  formatGroupNotes,
} from "./helpers/barbeat-serializer-state.ts";

export type { FormatOptions };

/**
 * Convert Live clip notes to compact bar|beat notation string.
 * Groups notes by start time, emits minimal state changes, and uses
 * comma merging for repeated pitch groups at different beats.
 * @param clipNotes - Array of note objects from the Live API
 * @param options - Formatting options (time signature, beats per bar)
 * @returns Compact bar|beat representation
 */
export function formatNotation(
  clipNotes: NoteEvent[] | null | undefined,
  options: FormatOptions = {},
): string {
  if (!clipNotes || clipNotes.length === 0) {
    return "";
  }

  // A read path must never throw: drop any note whose pitch can't be named
  // (out of 0-127) and warn, rather than aborting serialization.
  const notes = dropUnnameablePitches(clipNotes);

  if (notes.length === 0) {
    return "";
  }

  const config = resolveFormatConfig(options);
  const sortedNotes = sortNotes(notes);

  if (options.drumMode) {
    return formatDrumNotation(sortedNotes, config);
  }

  const timeGroups = groupNotesByTime(sortedNotes, config);
  const batches = findMergeBatches(timeGroups);
  const state = createInitialState(config.timeSigDenominator);
  const elements: string[] = [];

  for (const batch of batches) {
    // Use the first group's notes for state changes and pitch names
    // Every batch has at least one group
    const firstGroup = batch.groups[0] as (typeof batch.groups)[0];
    const noteElements = formatGroupNotes(
      firstGroup,
      state,
      config.timeSigDenominator,
    );

    elements.push(...noteElements);

    // Emit time position(s) — comma-separated beats for merged groups
    const bar = firstGroup.bar;
    const beats = batch.groups
      .map((g) => formatBeatPosition(g.beat, config.timeSigDenominator))
      .join(",");

    elements.push(`${bar}|${beats}`);
  }

  return elements.join(" ");
}

/**
 * Drop notes whose MIDI pitch is out of range (can't be named), warning once if
 * any were dropped. Keeps the read path total — an out-of-range pitch is
 * skipped, never thrown.
 * @param clipNotes - Notes to filter
 * @returns Notes with nameable pitches only
 */
function dropUnnameablePitches(clipNotes: NoteEvent[]): NoteEvent[] {
  const notes = clipNotes.filter((note) => isValidMidi(note.pitch));

  if (notes.length < clipNotes.length) {
    console.warn(
      `${clipNotes.length - notes.length} note(s) skipped: MIDI pitch outside valid range 0-127`,
    );
  }

  return notes;
}
