// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent, type BarCopyNote } from "../../../types.ts";

/**
 * Copy a note to a destination bar
 * @param sourceNote - Source note to copy
 * @param destBar - Destination bar number
 * @param destinationBarStart - Start time of destination bar
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 */
export function copyNoteToDestination(
  sourceNote: BarCopyNote,
  destBar: number,
  destinationBarStart: number,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): void {
  const copiedNote: NoteEvent = {
    pitch: sourceNote.pitch,
    start_time: destinationBarStart + sourceNote.relativeTime,
    duration: sourceNote.duration,
    velocity: sourceNote.velocity,
    probability: sourceNote.probability,
    velocity_deviation: sourceNote.velocity_deviation,
  };

  events.push(copiedNote);

  // Track in notesByBar cache
  if (!notesByBar.has(destBar)) {
    notesByBar.set(destBar, []);
  }

  const destBarNotes = notesByBar.get(destBar);

  if (destBarNotes) {
    destBarNotes.push({
      ...copiedNote,
      relativeTime: sourceNote.relativeTime,
      originalBar: destBar,
    });
  }
}

/**
 * Copy notes from one source bar to one destination bar
 * @param sourceBar - Source bar number
 * @param destinationBar - Destination bar number
 * @param notesByBar - Notes by bar cache
 * @param events - Output events array
 * @param barDuration - Duration of a bar
 * @returns True if copy succeeded
 */
export function copyBarToBar(
  sourceBar: number,
  destinationBar: number,
  notesByBar: Map<number, BarCopyNote[]>,
  events: NoteEvent[],
  barDuration: number,
): boolean {
  // Reject self-copy to prevent infinite loop
  if (sourceBar === destinationBar) {
    console.warn(
      `Cannot copy bar ${sourceBar} to itself (would cause infinite loop)`,
    );

    return false;
  }

  const sourceNotes = notesByBar.get(sourceBar);

  if (sourceNotes == null || sourceNotes.length === 0) {
    // Not warned per-bar: a sparse source (some empty bars) is normal, e.g. a
    // held multi-bar chord. The caller warns once via warnIfSourceEntirelyEmpty
    // only when the ENTIRE source turns out empty.
    return false;
  }

  // Copy and shift notes
  const destinationBarStart = (destinationBar - 1) * barDuration;

  for (const sourceNote of sourceNotes) {
    copyNoteToDestination(
      sourceNote,
      destinationBar,
      destinationBarStart,
      events,
      notesByBar,
    );
  }

  return true;
}
