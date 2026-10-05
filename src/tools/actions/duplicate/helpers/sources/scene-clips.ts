// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Reading a session scene's clips. A scene copy needs them for its length, for
// what it covers and to write, and copying never moves them, so a call reads
// the scene once and shares the pass.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** One clip of a scene, and the track holding it. */
export interface SceneClip {
  clip: LiveAPI;
  trackIndex: number;
}

/** What a scene holds, read once. */
export interface ScenePass {
  sceneIndex: number;
  /** Its clips, in track order */
  clips: SceneClip[];
  /** The longest clip, never under 4 beats, in Ableton beats */
  length: number;
}

/**
 * Callback type for forEachClipInScene
 */
type ClipInSceneCallback = (
  clip: LiveAPI,
  clipSlot: LiveAPI,
  trackIndex: number,
) => void;

/**
 * Iterate over all clips in a scene and call a callback for each
 * @param sceneIndex - Scene index
 * @param trackIds - Array of track IDs
 * @param callback - Callback to call for each clip
 */
export function forEachClipInScene(
  sceneIndex: number,
  trackIds: string[],
  callback: ClipInSceneCallback,
): void {
  for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
    const clipSlot = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex),
    );

    if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
      const clip = clipSlot.child("clip");

      if (clip.exists()) {
        callback(clip, clipSlot, trackIndex);
      }
    }
  }
}

/**
 * Where a scene sits in the Set.
 * @param sceneId - The scene's id
 * @returns Its index
 * @throws Error when there is no such scene, or it has no index
 */
export function sceneIndexOf(sceneId: string): number {
  const scene = LiveAPI.from(sceneId);

  if (!scene.exists()) {
    throw new Error(`scene with id "${sceneId}" does not exist`);
  }

  const sceneIndex = scene.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(`no scene index for ${targetLabel(scene)}`);
  }

  return sceneIndex;
}

/**
 * Read a scene's clips and the length of the longest.
 * @param sceneIndex - Scene index
 * @returns The pass
 */
export function readSceneClips(sceneIndex: number): ScenePass {
  const trackIds = LiveAPI.from(livePath.liveSet).getChildIds("tracks");
  const clips: SceneClip[] = [];
  // A scene is never shorter than 4 beats.
  let length = 4;

  forEachClipInScene(sceneIndex, trackIds, (clip, _clipSlot, trackIndex) => {
    clips.push({ clip, trackIndex });
    length = Math.max(length, clipLengthBeats(clip));
  });

  return { sceneIndex, clips, length };
}

/**
 * Read a scene by id.
 * @param sceneId - The scene's id
 * @returns The pass
 * @throws Error when there is no such scene, or it has no index
 */
export function readScene(sceneId: string): ScenePass {
  return readSceneClips(sceneIndexOf(sceneId));
}
