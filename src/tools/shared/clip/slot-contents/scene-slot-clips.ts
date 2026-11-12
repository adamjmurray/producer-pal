// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The clips a scene holds in its slots: one per regular track, then on Live 13
// one per return track. Callers that list a scene's clips share this, so none
// of them forgets the return tracks.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { returnClipsExist } from "#src/tools/shared/clip/slot-contents/return-track-clips.ts";
import {
  returnSlotPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";

/** One clip of a scene, with the slot that holds it. */
export interface SceneSlotClip {
  clip: LiveAPI;
  clipSlot: LiveAPI;
  /** Where it sits: "t0/s1", or "rt0/s1" on a return track */
  path: string;
  /** The regular track holding it, or undefined on a return track */
  trackIndex?: number;
}

/**
 * The clips a scene holds on regular tracks, in track order.
 * @param sceneIndex - The scene's index
 * @param trackCount - How many regular tracks there are
 * @returns The scene's clips, skipping empty slots
 */
export function regularSceneClips(
  sceneIndex: number,
  trackCount: number,
): SceneSlotClip[] {
  const found: SceneSlotClip[] = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const slot = clipIn(livePath.track(trackIndex).clipSlot(sceneIndex));

    if (slot != null) {
      found.push({
        ...slot,
        path: slotPath(trackIndex, sceneIndex),
        trackIndex,
      });
    }
  }

  return found;
}

/**
 * The clips a scene holds on return tracks, in track order. Only Live 13 has
 * return-track slots, so on Live 12 nothing is read.
 * @param sceneIndex - The scene's index
 * @returns The scene's return-track clips, skipping empty slots
 */
export function returnSceneClips(sceneIndex: number): SceneSlotClip[] {
  if (!returnClipsExist()) {
    return [];
  }

  const found: SceneSlotClip[] = [];
  const returnCount = LiveAPI.from(livePath.liveSet).getChildIds(
    "return_tracks",
  ).length;

  for (let returnIndex = 0; returnIndex < returnCount; returnIndex++) {
    const slot = clipIn(livePath.returnTrack(returnIndex).clipSlot(sceneIndex));

    if (slot != null) {
      found.push({ ...slot, path: returnSlotPath(returnIndex, sceneIndex) });
    }
  }

  return found;
}

/**
 * Every clip a scene holds: regular tracks first, then return tracks, the
 * order a scene read lists them in.
 * @param sceneIndex - The scene's index
 * @returns The scene's clips, skipping empty slots
 */
export function sceneClips(sceneIndex: number): SceneSlotClip[] {
  const trackCount = LiveAPI.from(livePath.liveSet).getChildIds(
    "tracks",
  ).length;

  return [
    ...regularSceneClips(sceneIndex, trackCount),
    ...returnSceneClips(sceneIndex),
  ];
}

/**
 * The clip in a slot, when there is one. Only a slot that holds one gets a
 * clip object built.
 * @param where - The slot's Live path
 * @returns The slot and its clip, or null for an empty slot
 */
function clipIn(
  where: ReturnType<ReturnType<typeof livePath.track>["clipSlot"]>,
): { clip: LiveAPI; clipSlot: LiveAPI } | null {
  const clipSlot = LiveAPI.from(where);

  if (!clipSlot.exists() || !clipSlot.getProperty("has_clip")) {
    return null;
  }

  const clip = clipSlot.child("clip");

  return clip.exists() ? { clip, clipSlot } : null;
}
