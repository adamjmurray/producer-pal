// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  createMissingScenes,
  withCreatedScenes,
} from "#src/tools/shared/clip/create-missing-scenes.ts";
import {
  clipCopyBlocker,
  clipOverwriteNote,
  copyClipToSlot,
} from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  canRecreateClip,
  recreatedClipLosses,
  recreateLossesNote,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { recreateIntoSlot } from "#src/tools/shared/clip/recreate-into-slot.ts";
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

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, so check first rather than reporting a copy that never happened.
  // Before the slot, too: no scene should be made to reach a missing track.
  const clipIsMidi = (sourceClip.getProperty("is_midi_clip") as number) > 0;
  const blocker = clipCopyBlocker(
    clipIsMidi,
    toTrackIndex,
    tracks.get(toTrackIndex),
  );

  // An entry rather than a throw, so the other slots of a comma-separated
  // toPath keep the copies they already made.
  if (blocker != null) {
    return skippedCopy(destination, blocker);
  }

  const prepared = prepareDestinationSlot(toTrackIndex, toSceneIndex);

  if (typeof prepared === "string") {
    return skippedCopy(destination, prepared);
  }

  const { clipSlot: destClipSlot, created } = prepared;

  // Read before the copy: the clip that was there is gone once it lands, and
  // the entry has to say the copy replaced it.
  const destinationWasOccupied = Boolean(destClipSlot.getProperty("has_clip"));

  // Compares the destination's clip before and after, so a declined copy can't
  // be reported as a success (and the slot's original clip can't be renamed).
  const newClip = copyClipToSlot(sourceClipSlot, destClipSlot);

  if (newClip == null) {
    return skippedCopy(
      destination,
      withCreatedScenes("Live made no copy there", created),
    );
  }

  newClip.setAll({ name, color });

  const copy = getMinimalClipInfo(newClip);

  if (created != null) {
    copy.created = created;
  }

  if (destinationWasOccupied) {
    copy.detail = clipOverwriteNote(destination);
  }

  return copy;
}

/**
 * Copies a session clip into clip slots.
 * @param slots - Destination slots, in order
 * @param object - Live API object to duplicate
 * @param labels - The call's names and colors
 * @returns Array of result objects
 */
export function duplicateClipToSlots(
  slots: ClipSlotPosition[],
  object: LiveAPI,
  labels: CopyLabels,
): object[] {
  const trackIndex = object.trackIndex;
  const sourceSceneIndex = object.sceneIndex;

  if (trackIndex == null || sourceSceneIndex == null) {
    return duplicateArrangementClipToSlots(slots, object, labels);
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

/**
 * Copies an arrangement clip into clip slots. Live has no API for that, so
 * each copy is re-created from the clip's notes or sample, and its entry says
 * what the re-create lost.
 * @param slots - Destination slots, in order
 * @param clip - The arrangement clip to copy
 * @param labels - The call's names and colors
 * @returns One entry per slot named, whether or not a copy landed in it
 */
export function duplicateArrangementClipToSlots(
  slots: ClipSlotPosition[],
  clip: LiveAPI,
  labels: CopyLabels,
): (MinimalClipInfo | TargetSkip)[] {
  claimLabels(labels, slots.length);

  const clipIsMidi = (clip.getProperty("is_midi_clip") as number) > 0;

  return slots.map((slot, i) => {
    const destination = slotPath(slot.trackIndex, slot.sceneIndex);
    const blocker = canRecreateClip(clip)
      ? clipCopyBlocker(clipIsMidi, slot.trackIndex)
      : "it's an audio clip with no sample file; drag it in Live's UI";

    if (blocker != null) {
      return skippedCopy(destination, blocker);
    }

    const prepared = prepareDestinationSlot(slot.trackIndex, slot.sceneIndex);

    if (typeof prepared === "string") {
      return skippedCopy(destination, prepared);
    }

    const losses = recreatedClipLosses(clip);
    const recreated = recreateIntoSlot(
      clip,
      slot,
      prepared.clipSlot,
      { name: labelName(labels, i), color: labelColor(labels, i) },
      losses,
    );

    if (!recreated.ok) {
      return skippedCopy(
        destination,
        withCreatedScenes(recreated.reason, prepared.created),
      );
    }

    const copy = getMinimalClipInfo(recreated.clip);

    if (prepared.created != null) {
      copy.created = prepared.created;
    }

    copy.detail = [
      ...(recreated.overwrote ? [clipOverwriteNote(destination)] : []),
      `re-created from the arrangement clip${recreateLossesNote(losses)}`,
    ].join("; ");

    return copy;
  });
}

// --- Helpers below main exports ---

/** A destination slot, and the scenes reaching it had to make. */
interface PreparedSlot {
  clipSlot: LiveAPI;
  created: string | null;
}

/**
 * The slot to copy into, creating the scenes up to it when it sits past the
 * last one — a slot path says on its own what to make.
 * @param trackIndex - The track the destination names
 * @param sceneIndex - The scene the destination names
 * @returns The slot and the scenes created, or the reason there is no slot
 */
function prepareDestinationSlot(
  trackIndex: number,
  sceneIndex: number,
): PreparedSlot | string {
  const slotApiPath = livePath.track(trackIndex).clipSlot(sceneIndex);
  const clipSlot = LiveAPI.from(slotApiPath);

  if (clipSlot.exists()) {
    return { clipSlot, created: null };
  }

  let created: string | null;

  try {
    created = createMissingScenes(sceneIndex);
  } catch (error) {
    return errorMessage(error);
  }

  const madeSlot = LiveAPI.from(slotApiPath);

  return madeSlot.exists()
    ? { clipSlot: madeSlot, created }
    : withCreatedScenes("no clip slot there", created);
}
