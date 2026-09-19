// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clipCopyBlocker,
  clipOverwriteNote,
  copyClipToSlot,
} from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  claimLabels,
  labelColor,
  labelName,
  type CopyLabels,
} from "../sources/copy-labels.ts";
import {
  type MinimalClipInfo,
  getMinimalClipInfo,
  skippedCopy,
} from "../minimal-clip-info.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";

/** The source objects every copy in one call shares. */
export interface SlotCopySource {
  /** The slot the clip is copied from */
  sourceClipSlot: LiveAPI;
  /** The clip in that slot */
  sourceClip: LiveAPI;
  /** The destination tracks, keyed by index */
  tracks: Map<number, LiveAPI>;
}

/**
 * Resolves everything a batch of copies shares: the slot it reads from and the
 * tracks it writes to. Copying a clip into a slot moves neither, so one
 * resolution of each serves the whole call.
 * @param sourceTrackIndex - Source track index
 * @param sourceSceneIndex - Source scene index
 * @param destinationTrackIndices - Track index of each destination slot
 * @returns The source slot, its clip, and the destination tracks
 */
export function resolveSlotCopySource(
  sourceTrackIndex: number,
  sourceSceneIndex: number,
  destinationTrackIndices: number[] = [],
): SlotCopySource {
  const sourceClipSlot = LiveAPI.from(
    livePath.track(sourceTrackIndex).clipSlot(sourceSceneIndex),
  );

  if (!sourceClipSlot.exists()) {
    throw new Error(
      `no clip slot at ${slotPath(sourceTrackIndex, sourceSceneIndex)}`,
    );
  }

  if (!sourceClipSlot.getProperty("has_clip")) {
    throw new Error(
      `no clip at ${slotPath(sourceTrackIndex, sourceSceneIndex)}`,
    );
  }

  return {
    sourceClipSlot,
    sourceClip: sourceClipSlot.child("clip"),
    tracks: new Map(
      [...new Set(destinationTrackIndices)].map((trackIndex) => [
        trackIndex,
        LiveAPI.from(livePath.track(trackIndex)),
      ]),
    ),
  };
}

/**
 * Duplicate a clip slot to another slot
 * @param sourceTrackIndex - Source track index
 * @param sourceSceneIndex - Source scene index
 * @param toTrackIndex - Destination track index
 * @param toSceneIndex - Destination scene index
 * @param name - Optional name for the duplicated clip
 * @param color - Optional color for the duplicated clip
 * @param shared - Source objects the caller already resolved for this call
 * @returns The new clip, or the entry saying no copy landed there
 */
export function duplicateClipSlot(
  sourceTrackIndex: number,
  sourceSceneIndex: number,
  toTrackIndex: number,
  toSceneIndex: number,
  name?: string,
  color?: string,
  shared: SlotCopySource = resolveSlotCopySource(
    sourceTrackIndex,
    sourceSceneIndex,
  ),
): MinimalClipInfo | TargetSkip {
  const { sourceClipSlot, sourceClip, tracks } = shared;
  const destination = slotPath(toTrackIndex, toSceneIndex);

  // Get destination clip slot
  const destClipSlot = LiveAPI.from(
    livePath.track(toTrackIndex).clipSlot(toSceneIndex),
  );

  // An entry rather than a throw, so the other slots of a comma-separated
  // toPath keep the copies they already made.
  if (!destClipSlot.exists()) {
    return skippedCopy(destination, "no clip slot there");
  }

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, so check first rather than reporting a copy that never happened.
  const clipIsMidi = (sourceClip.getProperty("is_midi_clip") as number) > 0;
  const blocker = clipCopyBlocker(
    clipIsMidi,
    toTrackIndex,
    tracks.get(toTrackIndex),
  );

  if (blocker != null) {
    return skippedCopy(destination, blocker);
  }

  // Read before the copy: the clip that was there is gone once it lands, and
  // the entry has to say the copy replaced it.
  const destinationWasOccupied = Boolean(destClipSlot.getProperty("has_clip"));

  // Compares the destination's clip before and after, so a declined copy can't
  // be reported as a success (and the slot's original clip can't be renamed).
  const newClip = copyClipToSlot(sourceClipSlot, destClipSlot);

  if (newClip == null) {
    return skippedCopy(destination, "Live made no copy there");
  }

  newClip.setAll({ name, color });

  const copy = getMinimalClipInfo(newClip);

  if (destinationWasOccupied) {
    copy.reason = clipOverwriteNote(destination);
  }

  return copy;
}

/**
 * Copies a session clip into clip slots.
 * @param slots - Destination slots, in order
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param labels - The call's names and colors
 * @returns Array of result objects
 */
export function duplicateClipToSlots(
  slots: ClipSlotPosition[],
  object: LiveAPI,
  id: string,
  labels: CopyLabels,
): object[] {
  const trackIndex = object.trackIndex;
  const sourceSceneIndex = object.sceneIndex;

  if (trackIndex == null || sourceSceneIndex == null) {
    throw new Error(
      `unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="${id}" path="${object.path}") `,
    );
  }

  claimLabels(labels, slots.length);

  const shared = resolveSlotCopySource(
    trackIndex,
    sourceSceneIndex,
    slots.map((slot) => slot.trackIndex),
  );

  // One entry per slot named, whether or not a copy landed in it.
  return slots.map((slot, i) =>
    duplicateClipSlot(
      trackIndex,
      sourceSceneIndex,
      slot.trackIndex,
      slot.sceneIndex,
      labelName(labels, i),
      labelColor(labels, i),
      shared,
    ),
  );
}
