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
import { slotPath } from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  getColorForIndex,
  parseCommaSeparatedColors,
} from "#src/tools/shared/validation/color-utils.ts";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  warnExtraNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { type SlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
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

  const sourceClip = sourceClipSlot.child("clip");

  // Get destination clip slot
  const destClipSlot = LiveAPI.from(
    livePath.track(toTrackIndex).clipSlot(toSceneIndex),
  );

  // Skip rather than throw, so the other slots of a comma-separated toPath keep
  // the copies they already made.
  if (!destClipSlot.exists()) {
    console.warn(
      `clip ${sourceClip.id} was not duplicated: no clip slot at ${slotPath(toTrackIndex, toSceneIndex)}`,
    );

    return null;
  }

  // Live's duplicate_clip_to no-ops on a track that won't take the clip instead
  // of failing, so check first rather than reporting a copy that never happened.
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
      `clip ${sourceClip.id} was not duplicated: no clip landed at ${slotPath(toTrackIndex, toSceneIndex)}`,
    );

    return null;
  }

  newClip.setAll({ name, color });

  // Return the new clip info directly
  return getMinimalClipInfo(newClip);
}

/**
 * Copies a session clip into session slots.
 * @param slots - Destination slots, in order
 * @param object - Live API object to duplicate
 * @param id - ID of the object
 * @param name - Base name for duplicated clips
 * @param color - Color for duplicated clips (cycles if comma-separated)
 * @returns Array of result objects
 */
export function duplicateClipToSlots(
  slots: SlotPosition[],
  object: LiveAPI,
  id: string,
  name: string | undefined,
  color: string | undefined,
): object[] {
  const trackIndex = object.trackIndex;
  const sourceSceneIndex = object.sceneIndex;

  if (trackIndex == null || sourceSceneIndex == null) {
    throw new Error(
      `unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="${id}" path="${object.path}") `,
    );
  }

  const parsedNames = parseCommaSeparatedNames(name, slots.length);
  const parsedColors = parseCommaSeparatedColors(color, slots.length);

  warnExtraNames(parsedNames, slots.length, "duplicate");

  // A copy Live declined warns and reports nothing, so the results only list
  // the copies that exist.
  return slots
    .map((slot, i) =>
      duplicateClipSlot(
        trackIndex,
        sourceSceneIndex,
        slot.trackIndex,
        slot.sceneIndex,
        getNameForIndex(name, i, parsedNames),
        getColorForIndex(color, i, parsedColors),
      ),
    )
    .filter((clipInfo) => clipInfo != null);
}
