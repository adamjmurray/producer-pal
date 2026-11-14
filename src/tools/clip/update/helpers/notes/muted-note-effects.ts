// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isSameSlot } from "#src/notation/helpers/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  mutedNativeOpNote,
  mutedOnlyQuantizeNote,
  mutedOverlapNote,
  mutedReplacedNote,
  notesShortenedNote,
} from "#src/tools/clip/helpers/notes/clip-entry-notes.ts";
import {
  hasSamePitchOverlap,
  overlapEffects,
} from "#src/tools/clip/helpers/notes/same-pitch-overlap.ts";
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
 * Say on the clip's entry what a note write did to notes beside it: replaced a
 * muted note, or Live cut a note short through an overlap at its pitch. Live,
 * not the write, decides the lengths, so they are read back.
 * @param clip - The clip that was just written
 * @param reasons - What each clip has to say beyond its result, added to
 * @param effects - What was written and what it landed on
 * @param effects.written - Every note written, muted ones included
 * @param effects.muted - The muted notes among them
 * @param effects.replaced - How many muted notes a transform replaced
 * @param reasonId - The id the clip's reasons are kept under, when that isn't
 *   the clip's own (a re-created clip has a new id)
 */
export function reportNoteWriteEffects(
  clip: LiveAPI,
  reasons: ClipReasons,
  {
    written,
    muted,
    replaced,
  }: { written: NoteEvent[]; muted: CopiedNote[]; replaced: number },
  reasonId = clip.id,
): void {
  const overlap = hasSamePitchOverlap(written)
    ? overlapEffects(written, new Set(muted), readAllClipNotes(clip))
    : { shortened: 0, shortenedByMuted: 0, mutedShortened: 0 };

  // Counted apart, so a note a muted one cut is never also a plain cut
  addCountedReason(reasons, reasonId, notesShortenedNote, overlap.shortened);
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
 * Say what a code write did to the clip's notes, the same way a note write does.
 * Code never sees muted notes, so a muted note is replaced exactly when it is
 * missing from what was written.
 * @param clip - The clip the code just wrote
 * @param reasons - What each clip has to say beyond its result, added to
 * @param reasonId - The id the clip's reasons are kept under
 * @param applied - What the write put in the clip
 * @param applied.written - Every note written, muted ones kept included
 * @param applied.muted - The clip's muted notes from before the write
 */
export function reportCodeWriteEffects(
  clip: LiveAPI,
  reasons: ClipReasons,
  reasonId: string,
  { written, muted }: AppliedNotes,
): void {
  const kept = new Set<NoteEvent>(written);
  const replaced = muted.filter((note) => !kept.has(note)).length;

  reportNoteWriteEffects(clip, reasons, { written, muted, replaced }, reasonId);
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
 * Say how many muted notes duplicateLoop copied: the muted notes in the doubled
 * clip's window, less those its window held before.
 * @param clip - The clip that was just doubled
 * @param reasons - What each clip has to say beyond its result, added to
 * @param mutedBefore - How many muted notes the window held before
 * @param window - The doubled clip's window: [from, span] in beats
 * @param mutedAfter - The clip's muted notes now
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
