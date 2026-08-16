// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  clipCopyBlocker,
  copyClipToSlot,
} from "#src/tools/shared/copy-clip-to-slot.ts";
import {
  type MinimalClipInfo,
  getMinimalClipInfo,
} from "../duplicate-helpers.ts";

/**
 * Duplicate a clip slot to another slot
 * @param sourceTrackIndex - Source track index
 * @param sourceSceneIndex - Source scene index
 * @param toTrackIndex - Destination track index
 * @param toSceneIndex - Destination scene index
 * @param name - Optional name for the duplicated clip
 * @param color - Optional color for the duplicated clip
 * @returns Minimal clip info object, or null when Live made no copy
 */
export function duplicateClipSlot(
  sourceTrackIndex: number,
  sourceSceneIndex: number,
  toTrackIndex: number,
  toSceneIndex: number,
  name?: string,
  color?: string,
): MinimalClipInfo | null {
  // Get source clip slot
  const sourceClipSlot = LiveAPI.from(
    livePath.track(sourceTrackIndex).clipSlot(sourceSceneIndex),
  );

  if (!sourceClipSlot.exists()) {
    throw new Error(
      `duplicate failed: source clip slot at track ${sourceTrackIndex}, scene ${sourceSceneIndex} does not exist`,
    );
  }

  if (!sourceClipSlot.getProperty("has_clip")) {
    throw new Error(
      `duplicate failed: no clip in source clip slot at track ${sourceTrackIndex}, scene ${sourceSceneIndex}`,
    );
  }

  // Get destination clip slot
  const destClipSlot = LiveAPI.from(
    livePath.track(toTrackIndex).clipSlot(toSceneIndex),
  );

  if (!destClipSlot.exists()) {
    throw new Error(
      `duplicate failed: destination clip slot at track ${toTrackIndex}, scene ${toSceneIndex} does not exist`,
    );
  }

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, so check first rather than reporting a copy that never happened.
  const sourceClip = sourceClipSlot.child("clip");
  const clipIsMidi = (sourceClip.getProperty("is_midi_clip") as number) > 0;
  const blocker = clipCopyBlocker(clipIsMidi, toTrackIndex);

  if (blocker != null) {
    console.warn(
      `${clipIsMidi ? "MIDI" : "audio"} clip ${sourceClip.id} was not duplicated: ${blocker}`,
    );

    return null;
  }

  // Compares the destination's clip before and after, so a declined copy can't
  // be reported as a success (and the slot's original clip can't be renamed).
  const newClip = copyClipToSlot(sourceClipSlot, destClipSlot);

  if (newClip == null) {
    console.warn(
      `clip ${sourceClip.id} was not duplicated: no clip landed at ${toTrackIndex}/${toSceneIndex}`,
    );

    return null;
  }

  newClip.setAll({ name, color });

  // Return the new clip info directly
  return getMinimalClipInfo(newClip);
}
