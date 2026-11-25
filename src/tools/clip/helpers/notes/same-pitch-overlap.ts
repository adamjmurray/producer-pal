// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live holds no two overlapping notes at one pitch: it cuts the earlier one at
// the later one's start. A write that overlaps notes this way lands shorter
// than written, so the entry says how many.

import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { readAllClipNotes } from "#src/tools/shared/clip/clip-notes.ts";

/** How many notes Live cut short, by what cut them. */
export interface OverlapEffects {
  /** Visible notes cut by a visible note */
  shortened: number;
  /** Visible notes cut by a muted note */
  shortenedByMuted: number;
  /** Muted notes cut by a visible note */
  mutedShortened: number;
}

/**
 * Whether two notes at one pitch overlap, so Live may cut one.
 * @param written - Every note written
 * @returns True when some note is still sounding when the next one at its pitch starts
 */
export function hasSamePitchOverlap(written: readonly NoteEvent[]): boolean {
  for (const notes of groupByPitch(written, (n) => n.pitch).values()) {
    const sorted = sortByStart(notes);

    for (let i = 0; i < sorted.length - 1; i++) {
      if (cutsNext(sorted[i] as NoteEvent, sorted[i + 1] as NoteEvent)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * How many visible notes a write put in the clip that Live cut short because
 * the next note at their pitch starts before they end. Reads the clip back, but
 * only when some written note could have been cut.
 * @param clip - The clip that was just written
 * @param written - Every note written
 * @returns The number of notes that came back shorter than written
 */
export function countShortenedNotes(
  clip: LiveAPI,
  written: readonly NoteEvent[],
): number {
  if (!hasSamePitchOverlap(written)) {
    return 0;
  }

  return overlapEffects(written, new Set(), readAllClipNotes(clip)).shortened;
}

/**
 * Find the notes Live shortened because a later note at their pitch started
 * before they ended. Live cuts the earlier of two same-pitch notes at the later
 * one's start, so a note that came back shorter than written was cut by the
 * next note at its pitch. A muted note cut by a muted note is not counted:
 * neither can be seen.
 * @param written - Every note written
 * @param muted - The muted ones among them
 * @param landed - The clip's notes as Live kept them
 * @returns How many notes were cut, by whether the cut and the cutter were muted
 */
export function overlapEffects(
  written: readonly NoteEvent[],
  muted: ReadonlySet<NoteEvent>,
  landed: Record<string, unknown>[],
): OverlapEffects {
  const landedByPitch = groupByPitch(
    landed.map((note) => ({
      pitch: note.pitch as number,
      start: note.start_time as number,
      duration: note.duration as number,
    })),
    (note) => note.pitch,
  );
  const effects = { shortened: 0, shortenedByMuted: 0, mutedShortened: 0 };

  for (const notes of groupByPitch(written, (n) => n.pitch).values()) {
    const sorted = sortByStart(notes);

    for (let i = 0; i < sorted.length - 1; i++) {
      const note = sorted[i] as NoteEvent;
      const next = sorted[i + 1] as NoteEvent;
      const kept = landedByPitch
        .get(note.pitch)
        ?.find((n) => Math.abs(n.start - note.start_time) < SAME_TIME_EPSILON);

      if (
        kept == null ||
        (muted.has(note) && muted.has(next)) ||
        kept.duration > note.duration - SAME_TIME_EPSILON
      ) {
        continue;
      }

      if (muted.has(note)) {
        effects.mutedShortened++;
      } else if (muted.has(next)) {
        effects.shortenedByMuted++;
      } else {
        effects.shortened++;
      }
    }
  }

  return effects;
}

/**
 * @param note - A note
 * @param next - The next note at its pitch
 * @returns True when the note is still sounding when the next one starts
 */
function cutsNext(note: NoteEvent, next: NoteEvent): boolean {
  return note.start_time + note.duration > next.start_time + SAME_TIME_EPSILON;
}

/**
 * @param notes - Notes to order
 * @returns The notes by start time
 */
function sortByStart(notes: readonly NoteEvent[]): NoteEvent[] {
  return notes.toSorted((a, b) => a.start_time - b.start_time);
}

/**
 * @param items - Items to group
 * @param pitchOf - Reads an item's pitch
 * @returns The items by pitch, in their original order
 */
function groupByPitch<T>(
  items: readonly T[],
  pitchOf: (item: T) => number,
): Map<number, T[]> {
  const groups = new Map<number, T[]>();

  for (const item of items) {
    const pitch = pitchOf(item);
    const group = groups.get(pitch);

    if (group == null) {
      groups.set(pitch, [item]);
    } else {
      group.push(item);
    }
  }

  return groups;
}
