// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
import { emptySlotGroupReason } from "#src/tools/shared/clip/group-track-clips.ts";
import {
  recreatedClipLosses,
  recreateLossesNote,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { recreateIntoSlot } from "#src/tools/shared/clip/recreate-into-slot.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
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
 * @returns The source slot, its clip, and no destination tracks yet
 */
export function resolveSlotCopySource(
  sourceTrackIndex: number,
  sourceSceneIndex: number,
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
      emptySlotGroupReason(sourceTrackIndex) ??
        `no clip at ${slotPath(sourceTrackIndex, sourceSceneIndex)}`,
    );
  }

  return {
    sourceClipSlot,
    sourceClip: sourceClipSlot.child("clip"),
    tracks: new Map(),
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
  const destination = slotPath(toTrackIndex, toSceneIndex);

  return guardSlot(destination, (progress) => {
    const { sourceClipSlot, sourceClip, tracks } = shared;

    // Live's duplicate_clip_to no-ops on a track that won't take the clip
    // instead of failing, so check first rather than reporting a copy that
    // never happened. Before the slot, too: no scene should be made to reach a
    // missing track.
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

    progress.created = created;

    // Read before the copy: the clip that was there is gone once it lands, and
    // the entry has to say the copy replaced it.
    const destinationWasOccupied = Boolean(
      destClipSlot.getProperty("has_clip"),
    );

    // Compares the destination's clip before and after, so a declined copy
    // can't be reported as a success (and the slot's original clip can't be
    // renamed).
    const newClip = copyClipToSlot(sourceClipSlot, destClipSlot);

    if (newClip == null) {
      return skippedCopy(
        destination,
        withCreatedScenes("Live made no copy there", created),
      );
    }

    progress.landed = newClip;

    if (destinationWasOccupied) {
      progress.note = clipOverwriteNote(destination);
    }

    newClip.setAll({ name, color });

    const landedAs = color == null ? {} : landedColor(newClip, color);
    const copy = getMinimalClipInfo(newClip);

    if (created != null) {
      copy.created = created;
    }

    if (landedAs.color != null) {
      copy.color = landedAs.color;
    }

    const detail = joinDetails([progress.note, landedAs.detail]);

    if (detail != null) {
      copy.detail = detail;
    }

    return copy;
  });
}

/**
 * Copies an arrangement clip into a clip slot. Live has no API for that, so
 * the copy is re-created from the clip's notes or sample, and its entry says
 * what the re-create lost.
 * @param clip - The arrangement clip to copy
 * @param slot - The destination slot
 * @param name - Name for the copy, if any
 * @param color - Color for the copy, if any
 * @returns The new clip, or the entry saying no copy landed there
 */
export function duplicateArrangementClipToSlot(
  clip: LiveAPI,
  slot: ClipSlotPosition,
  name: string | undefined,
  color: string | undefined,
): MinimalClipInfo | TargetSkip {
  const destination = slotPath(slot.trackIndex, slot.sceneIndex);

  // The call has already refused what this clip can't be re-created from, and
  // the tracks it can't land on.
  return guardSlot(destination, (progress) => {
    const prepared = prepareDestinationSlot(slot.trackIndex, slot.sceneIndex);

    if (typeof prepared === "string") {
      return skippedCopy(destination, prepared);
    }

    progress.created = prepared.created;

    const losses = recreatedClipLosses(clip);
    const recreated = recreateIntoSlot(
      clip,
      slot,
      prepared.clipSlot,
      { name, color },
      losses,
    );

    if (!recreated.ok) {
      return skippedCopy(
        destination,
        withCreatedScenes(recreated.reason, prepared.created),
      );
    }

    progress.landed = recreated.clip;

    const landedAs = color == null ? {} : landedColor(recreated.clip, color);

    progress.note = joinDetails([
      ...(recreated.overwrote ? [clipOverwriteNote(destination)] : []),
      `re-created from the arrangement clip${recreateLossesNote(losses)}`,
      landedAs.detail,
    ]);

    const copy = getMinimalClipInfo(recreated.clip);

    if (prepared.created != null) {
      copy.created = prepared.created;
    }

    if (landedAs.color != null) {
      copy.color = landedAs.color;
    }

    copy.detail = progress.note;

    return copy;
  });
}

// --- Helpers below main exports ---

/** How far one slot's copy got, for the entry a throw leaves behind. */
interface SlotProgress {
  /** The scenes made to reach the slot */
  created: string | null;
  /** The copy, once it exists */
  landed: LiveAPI | null;
  /** What its entry says about it, once that is known */
  note?: string;
}

/**
 * Runs one slot's copy, so a throw keeps that slot's entry instead of costing
 * the call the copies already made. Before the copy exists it is a skip; after,
 * the clip is there, so it is a clip entry saying what failed.
 * @param destination - The slot, as the path a copy there would report
 * @param run - Makes the copy, noting its progress as it goes
 * @returns The copy, or the entry saying none landed
 */
function guardSlot(
  destination: string,
  run: (progress: SlotProgress) => MinimalClipInfo | TargetSkip,
): MinimalClipInfo | TargetSkip {
  const progress: SlotProgress = { created: null, landed: null };

  try {
    return run(progress);
  } catch (error) {
    const reason = errorMessage(error);

    if (progress.landed == null) {
      return skippedCopy(
        destination,
        withCreatedScenes(reason, progress.created),
      );
    }

    return {
      id: progress.landed.id,
      path: destination,
      ...(progress.created != null && { created: progress.created }),
      detail: joinDetails([progress.note, `the copy landed, but ${reason}`]),
    };
  }
}

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
