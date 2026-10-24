// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  notesLandedOutsideNote,
  notesOutsideRegionNote,
} from "#src/tools/clip/helpers/clip-entry-notes.ts";
import {
  clipPlayRegion,
  readVisibleClipNotesInSpan,
  startsOutside,
} from "#src/tools/shared/clip/clip-notes.ts";
import { hasNoteEdits } from "./note-transforms.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-results.ts";
import { type ClipReasons, noteClipReason } from "../entries/clip-reasons.ts";

/**
 * Wide enough to cover every note a clip can hold, so it reads them all (the
 * entry's noteCount only reads a window around the region).
 */
const ALL_NOTES_FROM = -1_000_000;
const ALL_NOTES_SPAN = 2_000_000;

/** What a call sent that decides whether it can leave notes unplayed. */
interface RegionNoteEdit {
  clip: LiveAPI;
  reasons: ClipReasons;
  start?: string;
  length?: string;
  duplicateLoop?: boolean;
  arrangementLengthBeats?: number | null;
  notationString?: string;
  transformString?: string;
  preTransformString?: string;
}

/**
 * Which notes of a clip the call's note edit can leave unplayed, if any:
 * - `moves-region`: start or length moved the region, so every note outside it
 *   is the call's doing.
 * - `in-place`: the region stays, so only notes the edit puts outside it are.
 *   Ones already outside are none of its business.
 * - null: nothing to check: an audio clip, no note edit, or a duplicateLoop or
 *   arrangementLength, which can change the region after the notes are written.
 * @param edit - What the call sent
 * @param isAudioClip - Whether the clip is audio (audio clips hold no notes)
 * @returns How to check, or null
 */
function checkKind(
  edit: RegionNoteEdit,
  isAudioClip: boolean,
): "moves-region" | "in-place" | null {
  if (
    isAudioClip ||
    edit.duplicateLoop === true ||
    edit.arrangementLengthBeats != null ||
    !hasNoteEdits(
      edit.notationString,
      edit.transformString,
      edit.preTransformString,
    )
  ) {
    return null;
  }

  // firstStart and looping don't change which beats play: Live carries the
  // region across a looping toggle, and a firstStart stays inside it.
  return edit.start != null || edit.length != null
    ? "moves-region"
    : "in-place";
}

/**
 * Say on the clip's entry how many notes won't play for lying outside the
 * region. Muted notes are left out of the count, as in every note count.
 * Checked after the call's note writes, only when the call edits notes: then
 * the notes the model sees and the ones that play can differ.
 * - A call that moves the region counts every note outside it (one read).
 * - One that leaves it alone counts only the notes the write put there, which
 *   the write already knows (a transform can push notes past the end, which
 *   leaves them unplayed with no other sign). No read.
 * @param edit - What the call sent, and where to say what it finds
 * @param isAudioClip - Whether the clip is audio (audio clips hold no notes)
 * @param noteResult - What the note write returned, or null when it wrote none
 */
export function reportNotesOutsideRegion(
  edit: RegionNoteEdit,
  isAudioClip: boolean,
  noteResult: NoteUpdateResult | null,
): void {
  const kind = checkKind(edit, isAudioClip);

  if (kind == null) {
    return;
  }

  const { clip } = edit;
  const note =
    kind === "moves-region"
      ? notesOutsideRegionNote(countAllOutside(clip))
      : notesLandedOutsideNote(noteResult?.putOutside ?? 0);

  if (note != null) {
    noteClipReason(edit.reasons, clip.id, note);
  }
}

/**
 * @param clip - LiveAPI clip object
 * @returns How many visible notes the clip holds outside its region, wherever
 *   they start
 */
function countAllOutside(clip: LiveAPI): number {
  const region = clipPlayRegion(clip);

  return readVisibleClipNotesInSpan(
    clip,
    ALL_NOTES_FROM,
    ALL_NOTES_SPAN,
  ).filter((note) => startsOutside(note as { start_time: number }, region))
    .length;
}
