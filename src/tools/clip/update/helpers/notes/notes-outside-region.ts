// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readClipNotesInSpan } from "#src/tools/shared/clip/clip-notes.ts";
import { hasNoteEdits } from "./note-transforms.ts";
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
  notationString?: string;
  transformString?: string;
  preTransformString?: string;
}

/**
 * Say on the clip's entry how many notes lie outside its region and won't play.
 * Checked after the call's writes, only when the call may move the region AND
 * edits notes: then the notes the model sees and the ones that play can differ.
 * @param edit - What the call sent, and where to say what it finds
 * @param isAudioClip - Whether the clip is audio (audio clips hold no notes)
 */
export function reportNotesOutsideRegion(
  edit: RegionNoteEdit,
  isAudioClip: boolean,
): void {
  // firstStart and looping don't change which beats play: Live carries the
  // region across a looping toggle, and a firstStart stays inside it.
  const movesRegion = edit.start != null || edit.length != null;

  if (
    isAudioClip ||
    !movesRegion ||
    !hasNoteEdits(
      edit.notationString,
      edit.transformString,
      edit.preTransformString,
    )
  ) {
    return;
  }

  const { clip } = edit;
  const looping = (clip.getProperty("looping") as number) > 0;
  const startMarker = clip.getProperty("start_marker") as number;
  // A looping clip plays from start_marker once, then loops loop_start..loop_end.
  const from = looping
    ? Math.min(startMarker, clip.getProperty("loop_start") as number)
    : startMarker;
  const to = clip.getProperty(looping ? "loop_end" : "end_marker") as number;
  const count = readClipNotesInSpan(
    clip,
    ALL_NOTES_FROM,
    ALL_NOTES_SPAN,
  ).filter(
    (note) =>
      (note.start_time as number) < from || (note.start_time as number) >= to,
  ).length;

  if (count > 0) {
    noteClipReason(
      edit.reasons,
      clip.id,
      `${count} ${count === 1 ? "note is" : "notes are"} outside the region and won't play`,
    );
  }
}
