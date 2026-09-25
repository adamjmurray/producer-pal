// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  buildClipResultObject,
  type ClipResult,
  keepClip,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { emptyTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-placeholder.ts";
import {
  clipCopyBlocker,
  copyClipToSlot,
} from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  createMissingScenes,
  withCreatedScenes,
} from "#src/tools/shared/clip/create-missing-scenes.ts";
import {
  canRecreateClip,
  recreatedClipLosses,
  recreateLossesNote,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { recreateIntoSlot } from "#src/tools/shared/clip/recreate-into-slot.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  objectPathForApi,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  noteClipOverwrite,
  noteClipReason,
  refuseClipWork,
  type ClipReasons,
} from "../entries/clip-reasons.ts";

/** A destination slot, and the scenes reaching it had to make. */
interface PreparedDestination {
  clipSlot: LiveAPI;
  created: string | null;
}

interface SlotMoveArgs {
  clip: LiveAPI;
  toSlot: ClipSlotPosition;
  /** Destination tracks the batch has already resolved, keyed by track index. */
  destinationTracks?: Map<number, LiveAPI>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
}

/**
 * Move a session clip to a different clip slot
 * @param args - Operation arguments
 * @param args.clip - The session clip to move
 * @param args.toSlot - Destination slot position
 * @param args.destinationTracks - Destination tracks the batch already resolved
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 * @param args.reasons - What each clip has to say beyond its result
 */
export function handleClipSlotMove({
  clip,
  toSlot,
  destinationTracks,
  updatedClips,
  noteResult,
  reasons,
}: SlotMoveArgs): void {
  const srcTrackIndex = clip.trackIndex;
  const srcSceneIndex = clip.sceneIndex;

  if (srcTrackIndex == null || srcSceneIndex == null) {
    refuseClipWork(reasons, clip.id, "not moved: could not determine its slot");
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

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, and the source is deleted right after — check first rather than
  // destroying the clip and reporting it moved. Before the slot, too: a missing
  // track is the track's own reason, and no scene should be made to reach it.
  const clipIsMidi = (clip.getProperty("is_midi_clip") as number) > 0;
  const blocker = clipCopyBlocker(
    clipIsMidi,
    toSlot.trackIndex,
    destinationTrack(toSlot.trackIndex, destinationTracks),
  );

  if (blocker != null) {
    refuseClipWork(reasons, clip.id, `not moved: ${blocker}`);
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  const destination = destinationSlot({
    clip,
    toSlot,
    updatedClips,
    noteResult,
    reasons,
  });

  if (destination == null) {
    return;
  }

  const { clipSlot: destClipSlot, created } = destination;

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
    refuseClipWork(
      reasons,
      clip.id,
      withCreatedScenes(
        `not moved: no clip landed at ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)}, so the original was kept`,
        created,
      ),
    );
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  if (destinationWasOccupied) {
    noteClipOverwrite(
      reasons,
      clip.id,
      slotPath(toSlot.trackIndex, toSlot.sceneIndex),
    );
  }

  deleteMovedSource({
    reasons,
    clipId: clip.id,
    source: slotPath(srcTrackIndex, srcSceneIndex),
    deleteSource: () => sourceClipSlot.call("delete_clip"),
  });
  pushMovedClip(updatedClips, newClip, noteResult, created);
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
 * @param args.reasons - What each clip has to say beyond its result
 */
export function handleArrangementToSlotMove({
  clip,
  toSlot,
  updatedClips,
  noteResult,
  reasons,
}: SlotMoveArgs): void {
  const blocker = arrangementToSlotBlocker(clip, toSlot);

  if (blocker != null) {
    refuseClipWork(reasons, clip.id, `not moved: ${blocker}`);
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  const destination = destinationSlot({
    clip,
    toSlot,
    updatedClips,
    noteResult,
    reasons,
  });

  if (destination == null) {
    return;
  }

  const { clipSlot: destClipSlot, created } = destination;

  // Read before the source is touched: everything below changes what it holds.
  const losses = recreatedClipLosses(clip);
  const sourceTrack = LiveAPI.from(livePath.track(clip.trackIndex as number));
  const destPath = slotPath(toSlot.trackIndex, toSlot.sceneIndex);
  const recreated = recreateIntoSlot(clip, toSlot, destClipSlot, {}, losses);

  if (!recreated.ok) {
    refuseClipWork(
      reasons,
      clip.id,
      withCreatedScenes(
        `not moved: ${recreated.reason} The source clip in the arrangement is untouched.`,
        created,
      ),
    );
    keepClip(clip, updatedClips, noteResult);

    return;
  }

  const newClip = recreated.clip;

  if (recreated.overwrote) {
    noteClipOverwrite(reasons, clip.id, destPath);
  }

  noteClipReason(
    reasons,
    clip.id,
    `re-created at ${destPath}${recreateLossesNote(losses)}`,
  );

  if (isTakeLaneClip(clip)) {
    noteClipReason(reasons, clip.id, emptyTakeLaneClip(clip));
  } else {
    deleteMovedSource({
      reasons,
      clipId: clip.id,
      source: targetLabel(clip),
      deleteSource: () => sourceTrack.call("delete_clip", toLiveApiId(clip.id)),
    });
  }

  pushMovedClip(updatedClips, newClip, noteResult, created);
}

// --- Helpers below main exports ---

/**
 * Report the clip the move landed, naming the scenes reaching it had to make.
 * @param updatedClips - Array to collect results
 * @param newClip - The clip at the destination
 * @param noteResult - Note update result for result
 * @param created - The scenes created, or null when none were
 */
function pushMovedClip(
  updatedClips: ClipResult[],
  newClip: LiveAPI,
  noteResult: NoteUpdateResult | null,
  created: string | null,
): void {
  const entry = buildClipResultObject(
    newClip.id,
    noteResult,
    objectPathForApi(newClip),
  );

  if (created != null) {
    entry.created = created;
  }

  updatedClips.push(entry);
}

interface DeleteSourceArgs {
  /** What each clip has to say beyond its result. */
  reasons: ClipReasons;
  /** The clip, by the id the call found it at. */
  clipId: string;
  /** Where the source clip still sits, as the reason names it. */
  source: string;
  /** Removes the source clip from Live. */
  deleteSource: () => void;
}

/**
 * Delete the clip the move copied out of, saying so on its entry when Live
 * refuses. The copy exists whatever the delete does, so letting the throw out
 * would cost the caller a clip that is really there.
 * @param args - The clip, where it sits, and how to delete it
 * @param args.reasons - What each clip has to say beyond its result, added to
 * @param args.clipId - The clip, by the id the call found it at
 * @param args.source - Where the source clip still sits
 * @param args.deleteSource - Removes the source clip from Live
 */
function deleteMovedSource({
  reasons,
  clipId,
  source,
  deleteSource,
}: DeleteSourceArgs): void {
  try {
    deleteSource();
  } catch (error) {
    noteClipReason(
      reasons,
      clipId,
      `the original at ${source} could not be deleted (${errorMessage(error)}); delete it in Live`,
    );
  }
}

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
 * The destination track, resolved once per index for the whole call: every clip
 * a batch moves into one track asks the same track whether it takes the copy.
 *
 * Reusing it is safe because nothing in the batch can change the answer —
 * update-clip creates and deletes no tracks, and the only reads through the
 * object are the blocker's has_midi_input and is_frozen. The path check covers
 * what the batch doesn't control: a held object follows its own object, not its
 * index, so a track inserted ahead of this one (by the user, or by a request
 * overlapping this one's awaits) rewrites the held path and it stops matching
 * the index this clip was sent to. Reading a path builds nothing.
 * @param trackIndex - Destination track index
 * @param tracks - Tracks the batch has already resolved, added to
 * @returns The destination track
 */
function destinationTrack(
  trackIndex: number,
  tracks: Map<number, LiveAPI> | undefined,
): LiveAPI {
  const path = String(livePath.track(trackIndex));
  const resolved = tracks?.get(trackIndex);

  if (resolved != null && resolved.path === path) {
    return resolved;
  }

  const track = LiveAPI.from(path);

  tracks?.set(trackIndex, track);

  return track;
}

/**
 * The destination slot. When it sits past the last scene, the scenes up to it
 * are made — the path says what to create, so the move creates it. Null when
 * the slot still isn't there, in which case the clip is left where it is and
 * its entry says it didn't move.
 * @param args - The clip, the destination, and the call's collectors
 * @param args.clip - The clip being moved
 * @param args.toSlot - Destination slot position
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 * @param args.reasons - What each clip has to say beyond its result
 * @returns The destination ClipSlot and the scenes created, or null
 */
function destinationSlot(
  args: Omit<SlotMoveArgs, "destinationTracks">,
): PreparedDestination | null {
  const { toSlot } = args;
  const path = livePath.track(toSlot.trackIndex).clipSlot(toSlot.sceneIndex);
  const clipSlot = LiveAPI.from(path);

  if (clipSlot.exists()) {
    return { clipSlot, created: null };
  }

  let created: string | null;

  try {
    created = createMissingScenes(toSlot.sceneIndex);
  } catch (error) {
    return refuseSlotMove(args, errorMessage(error));
  }

  const madeSlot = LiveAPI.from(path);

  if (madeSlot.exists()) {
    return { clipSlot: madeSlot, created };
  }

  return refuseSlotMove(
    args,
    withCreatedScenes(
      `destination ${slotPath(toSlot.trackIndex, toSlot.sceneIndex)} does not exist`,
      created,
    ),
  );
}

/**
 * Leave the clip where it is, saying why it didn't move.
 * @param args - The clip, the destination, and the call's collectors
 * @param args.clip - The clip being moved
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for result
 * @param args.reasons - What each clip has to say beyond its result
 * @param reason - Why the destination couldn't be reached
 * @returns Null, for the caller to return
 */
function refuseSlotMove(
  {
    clip,
    updatedClips,
    noteResult,
    reasons,
  }: Omit<SlotMoveArgs, "destinationTracks">,
  reason: string,
): null {
  refuseClipWork(reasons, clip.id, `not moved: ${reason}`);
  keepClip(clip, updatedClips, noteResult);

  return null;
}
