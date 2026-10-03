// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isSameSlot } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import {
  mutedNativeOpNote,
  mutedOnlyQuantizeNote,
  mutedOverlapNote,
  mutedReplacedNote,
} from "#src/tools/clip/helpers/clip-entry-notes.ts";
import { type AppliedNotes } from "#src/tools/clip/code-exec/clip-notes-exchange.ts";
import {
  type ClipNotes,
  type CopiedNote,
  readAllClipNotes,
  readClipNotes,
} from "#src/tools/shared/clip/clip-notes.ts";
import { type ClipReasons, noteClipReason } from "../entries/clip-reasons.ts";

/**
 * The muted notes that sit at the same pitch and start as one of `notes`: a
 * write there replaces them.
 * @param notes - Notes about to be written
 * @param muted - The clip's muted notes
 * @returns The muted notes those would replace
 */
export function mutedNotesHit(
  notes: readonly NoteEvent[],
  muted: readonly CopiedNote[],
): Set<CopiedNote> {
  return new Set(
    muted.filter((mutedNote) => notes.some((n) => isSameSlot(n, mutedNote))),
  );
}

/**
 * Say on the clip's entry what a note write did to muted notes the model can't
 * see: replaced one, or changed a length through an overlap. Live, not the
 * write, decides the lengths, so they are read back.
 * @param clip - The clip that was just written
 * @param reasons - What each clip has to say beyond its result, added to
 * @param effects - What was written and what it landed on
 * @param effects.written - Every note written, muted ones included
 * @param effects.muted - The muted notes among them
 * @param effects.replaced - How many muted notes a transform replaced
 * @param reasonId - The id the clip's reasons are kept under, when that isn't
 *   the clip's own (a re-created clip has a new id)
 */
export function reportMutedNoteEffects(
  clip: LiveAPI,
  reasons: ClipReasons,
  {
    written,
    muted,
    replaced,
  }: { written: NoteEvent[]; muted: CopiedNote[]; replaced: number },
  reasonId = clip.id,
): void {
  if (muted.length === 0) {
    return;
  }

  const overlap =
    written.length > 0
      ? overlapEffects(written, new Set(muted), readAllClipNotes(clip))
      : { shortenedByMuted: 0, mutedShortened: 0 };

  addCountedReason(reasons, reasonId, mutedReplacedNote, replaced);
  addCountedReason(
    reasons,
    reasonId,
    (count) => mutedOverlapNote(count, false),
    overlap.shortenedByMuted,
  );
  addCountedReason(
    reasons,
    reasonId,
    (count) => mutedOverlapNote(count, true),
    overlap.mutedShortened,
  );
}

/**
 * Say what a code write did to muted notes, the same way a note write does.
 * Code never sees muted notes, so a muted note is replaced exactly when it is
 * missing from what was written.
 * @param clip - The clip the code just wrote
 * @param reasons - What each clip has to say beyond its result, added to
 * @param reasonId - The id the clip's reasons are kept under
 * @param applied - What the write put in the clip
 * @param applied.written - Every note written, muted ones kept included
 * @param applied.muted - The clip's muted notes from before the write
 */
export function reportMutedCodeWrite(
  clip: LiveAPI,
  reasons: ClipReasons,
  reasonId: string,
  { written, muted }: AppliedNotes,
): void {
  const kept = new Set<NoteEvent>(written);
  const replaced = muted.filter((note) => !kept.has(note)).length;

  reportMutedNoteEffects(clip, reasons, { written, muted, replaced }, reasonId);
}

/**
 * Say how many muted notes a quantize moved. Live quantizes them with the rest,
 * and a clip of only muted notes would otherwise answer with nothing at all.
 * @param clip - The clip that was just quantized
 * @param reasons - What each clip has to say beyond its result, added to
 * @param before - The clip's notes as they were read before the quantize
 */
export function reportMutedQuantize(
  clip: LiveAPI,
  reasons: ClipReasons,
  before: ClipNotes,
): void {
  if (before.muted.length === 0) {
    return;
  }

  const unmoved = new Map<string, number>();

  for (const note of before.muted) {
    const key = noteKey(note);

    unmoved.set(key, (unmoved.get(key) ?? 0) + 1);
  }

  let moved = before.muted.length;

  for (const note of readClipNotes(clip).muted) {
    const key = noteKey(note);
    const left = unmoved.get(key) ?? 0;

    if (left > 0) {
      unmoved.set(key, left - 1);
      moved--;
    }
  }

  if (moved > 0) {
    addCountedReason(
      reasons,
      clip.id,
      (count) => mutedNativeOpNote("quantized", count),
      moved,
    );
  } else if (before.visible.length === 0) {
    addCountedReason(reasons, clip.id, () => mutedOnlyQuantizeNote(), 1);
  }
}

/**
 * Say how many muted notes duplicateLoop copied: the muted notes in the window
 * that was read before, now against the same window after.
 * @param clip - The clip that was just doubled
 * @param reasons - What each clip has to say beyond its result, added to
 * @param mutedBefore - How many muted notes the window held before
 * @param window - The window those were read over: [from, span] in beats
 * @param mutedAfter - The clip's muted notes now, over its new, wider window
 */
export function reportMutedCopies(
  clip: LiveAPI,
  reasons: ClipReasons,
  mutedBefore: number,
  window: readonly [number, number],
  mutedAfter: readonly Record<string, unknown>[],
): void {
  const [from, span] = window;
  const inWindow = mutedAfter.filter(
    (note) =>
      (note.start_time as number) >= from &&
      (note.start_time as number) < from + span,
  ).length;

  addCountedReason(
    reasons,
    clip.id,
    (count) => `duplicateLoop ${mutedNativeOpNote("copied", count)}`,
    inWindow - mutedBefore,
  );
}

/**
 * Add a count to what a clip's entry says, or to the same thing it already
 * says, so a note two passes each found reads as their total.
 * @param reasons - What each clip has to say beyond its result, added to
 * @param clipId - The clip
 * @param make - Words for a count, or null when there is nothing to say
 * @param count - How many this time
 */
function addCountedReason(
  reasons: ClipReasons,
  clipId: string,
  make: (count: number) => string | null,
  count: number,
): void {
  const note = count > 0 ? make(count) : null;

  if (note == null) {
    return;
  }

  // The same thing reads alike apart from its number and singular or plural
  const said = reasons.said.get(clipId) ?? [];
  const index = said.findIndex((reason) => shape(reason) === shape(note));

  if (index < 0) {
    noteClipReason(reasons, clipId, note);

    return;
  }

  const earlier = Number(/\d+/.exec(said[index] as string)?.[0]);

  said[index] = make(earlier + count) as string;
}

/**
 * Find the notes Live shortened because a muted note overlapped them, or that
 * they shortened. Live cuts the earlier of two same-pitch notes at the later
 * one's start, so a note that came back shorter than written was cut by the
 * next note at its pitch.
 * @param written - Every note written
 * @param muted - The muted ones among them
 * @param landed - The clip's notes as Live kept them
 * @returns How many visible notes a muted one cut, and how many muted notes a visible one cut
 */
function overlapEffects(
  written: readonly NoteEvent[],
  muted: ReadonlySet<NoteEvent>,
  landed: Record<string, unknown>[],
): { shortenedByMuted: number; mutedShortened: number } {
  const landedByPitch = groupByPitch(
    landed.map((note) => ({
      pitch: note.pitch as number,
      start: note.start_time as number,
      duration: note.duration as number,
    })),
    (note) => note.pitch,
  );
  let shortenedByMuted = 0;
  let mutedShortened = 0;

  for (const notes of groupByPitch(written, (n) => n.pitch).values()) {
    const sorted = notes.toSorted((a, b) => a.start_time - b.start_time);

    for (let i = 0; i < sorted.length - 1; i++) {
      const note = sorted[i] as NoteEvent;
      const next = sorted[i + 1] as NoteEvent;
      const kept = landedByPitch
        .get(note.pitch)
        ?.find((n) => Math.abs(n.start - note.start_time) < SAME_TIME_EPSILON);

      if (
        kept == null ||
        muted.has(note) === muted.has(next) ||
        kept.duration > note.duration - SAME_TIME_EPSILON
      ) {
        continue;
      }

      if (muted.has(note)) {
        mutedShortened++;
      } else {
        shortenedByMuted++;
      }
    }
  }

  return { shortenedByMuted, mutedShortened };
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

/**
 * @param text - A counted note for a clip's entry
 * @returns The note with its number and singular or plural taken out
 */
function shape(text: string): string {
  return text.replace(/\d+/, "#").replaceAll(/notes\b/g, "note");
}

/**
 * @param note - A raw note from get_notes_extended
 * @returns A key for its pitch and start
 */
function noteKey(note: Record<string, unknown>): string {
  return `${note.pitch as number}@${note.start_time as number}`;
}
