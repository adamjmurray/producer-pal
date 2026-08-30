// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { emptyTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-placeholder.ts";
import {
  clipCopyBlocker,
  copyClipToSlot,
} from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  canRecreateClip,
  recreateClipInSlot,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { slotPath } from "#src/tools/shared/validation/object-path-helpers.ts";

interface SlotMoveArgs {
  clip: LiveAPI;
  toSlot: ClipSlotPosition;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
}

/**
 * Move a session clip to a different clip slot
 * @param args - Operation arguments
 * @param args.clip - The session clip to move
 * @param args.toSlot - Destination slot position
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 */
export function handleClipSlotMove({
  clip,
  toSlot,
  updatedClips,
  noteResult,
}: SlotMoveArgs): void {
  const srcTrackIndex = clip.trackIndex;
  const srcSceneIndex = clip.sceneIndex;

  if (srcTrackIndex == null || srcSceneIndex == null) {
    console.warn(`could not determine slot position for clip ${clip.id}`);
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  // Same slot — no-op
  if (
    srcTrackIndex === toSlot.trackIndex &&
    srcSceneIndex === toSlot.sceneIndex
  ) {
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  const destClipSlot = destinationSlot(clip, toSlot, updatedClips, noteResult);

  if (destClipSlot == null) return;

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, and the source is deleted right after — check first rather than
  // destroying the clip and reporting it moved.
  const clipIsMidi = (clip.getProperty("is_midi_clip") as number) > 0;
  const blocker = clipCopyBlocker(clipIsMidi, toSlot.trackIndex);

  if (blocker != null) {
    console.warn(
      `${clipIsMidi ? "MIDI" : "audio"} clip ${clip.id} was not moved: ${blocker}`,
    );
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  // Read now, warn after the copy: when copyClipToSlot declines, the occupant
  // is still there and an up-front warning contradicts the one that follows.
  const destinationWasOccupied = Boolean(destClipSlot.getProperty("has_clip"));

  const sourceClipSlot = LiveAPI.from(
    livePath.track(srcTrackIndex).clipSlot(srcSceneIndex),
  );

  // Look before deleting. duplicate_clip_to reports nothing when it declines a
  // copy, so anything the checks above didn't catch would destroy the clip and
  // report a move. copyClipToSlot compares the destination's clip before and
  // after, so an occupied slot's original clip can't be mistaken for the copy.
  const newClip = copyClipToSlot(sourceClipSlot, destClipSlot);

  if (newClip == null) {
    console.warn(
      `clip ${clip.id} was not moved: no clip landed at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}, so the original was kept`,
    );
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  if (destinationWasOccupied) {
    console.warn(
      `overwrote the existing clip at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}`,
    );
  }

  sourceClipSlot.call("delete_clip");
  updatedClips.push(
    buildClipResultObject(newClip.id, noteResult, objectPathForApi(newClip)),
  );
}

/**
 * Move an arrangement clip into a session clip slot.
 *
 * Live has no API that duplicates an arrangement clip into a slot, so the clip
 * is re-created there — MIDI from its notes, audio from its sample — and the
 * original deleted. That drops automation envelopes, which nothing can read
 * back out, so the move warns whenever the source has any.
 *
 * A take-lane source can't be deleted, so it is cleared in place instead.
 * @param args - Operation arguments
 * @param args.clip - The arrangement clip to move
 * @param args.toSlot - Destination slot position
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 */
export function handleArrangementToSlotMove({
  clip,
  toSlot,
  updatedClips,
  noteResult,
}: SlotMoveArgs): void {
  const blocker = arrangementToSlotBlocker(clip, toSlot);

  if (blocker != null) {
    console.warn(`clip ${clip.id} was not moved: ${blocker}`);
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  const destClipSlot = destinationSlot(clip, toSlot, updatedClips, noteResult);

  if (destClipSlot == null) return;

  // Read before the source is touched: everything below changes what it holds.
  const losses = recreatedClipLosses(clip);
  const track = LiveAPI.from(livePath.track(clip.trackIndex as number));

  // Unlike an arrangement lane, a slot refuses a create over the clip it holds,
  // so the occupant goes first. The guards above already ruled out the ways the
  // create can fail, so this doesn't clear a slot for a copy that never lands.
  if (destClipSlot.getProperty("has_clip")) {
    destClipSlot.call("delete_clip");
    console.warn(
      `overwrote the existing clip at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}`,
    );
  }

  const newClip = recreateClipInSlot(clip, destClipSlot, undefined, undefined);

  console.warn(
    `arrangement clip ${clip.id} was re-created at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}` +
      (losses ? ` (${losses})` : ""),
  );

  if (isTakeLaneClip(clip)) {
    emptyTakeLaneClip(clip);
  } else {
    track.call("delete_clip", toLiveApiId(clip.id));
  }

  updatedClips.push(
    buildClipResultObject(newClip.id, noteResult, objectPathForApi(newClip)),
  );
}

// --- Helpers below main exports ---

/**
 * Says why an arrangement clip can't move into a slot, or null when it can.
 * @param clip - The arrangement clip to move
 * @param toSlot - Destination slot position
 * @returns The reason, worded for a warning, or null
 */
function arrangementToSlotBlocker(
  clip: LiveAPI,
  toSlot: ClipSlotPosition,
): string | null {
  if (clip.trackIndex == null) {
    return "could not determine its track";
  }

  // Audio is rebuilt from its sample, so a clip that has none can't be moved.
  if (!canRecreateClip(clip)) {
    return "it's an audio clip with no sample file; drag it in Live's UI";
  }

  return clipCopyBlocker(
    (clip.getProperty("is_midi_clip") as number) > 0,
    toSlot.trackIndex,
  );
}

/**
 * The destination slot, or null when it doesn't exist — in which case the clip
 * is left where it is and reported unmoved.
 * @param clip - The clip being moved
 * @param toSlot - Destination slot position
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 * @returns The destination ClipSlot, or null
 */
function destinationSlot(
  clip: LiveAPI,
  toSlot: ClipSlotPosition,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): LiveAPI | null {
  const destClipSlot = LiveAPI.from(
    livePath.track(toSlot.trackIndex).clipSlot(toSlot.sceneIndex),
  );

  if (destClipSlot.exists()) return destClipSlot;

  console.warn(
    `destination ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)} does not exist`,
  );
  keepClip(clip, updatedClips, noteResult);

  return null;
}

/**
 * Report the clip at its current position, for a move that didn't happen.
 * @param clip - The clip that stayed put
 * @param updatedClips - Array to collect results
 * @param noteResult - Note update result for result
 */
function keepClip(
  clip: LiveAPI,
  updatedClips: ClipResult[],
  noteResult: NoteUpdateResult | null,
): void {
  updatedClips.push(
    buildClipResultObject(clip.id, noteResult, objectPathForApi(clip)),
  );
}
