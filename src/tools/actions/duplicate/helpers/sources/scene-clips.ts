// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Reading a session scene's clips. A scene copy needs them for its length, for
// what it covers and to write, and copying never moves them, so a call reads
// the scene once and shares the pass.

import { idDoesNotExist } from "#src/tools/shared/validation/id-validation.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  regularSceneClips,
  returnSceneClips,
} from "#src/tools/shared/clip/slot-contents/scene-slot-clips.ts";
import { copyLengthBeats } from "../clip/arrangement-length.ts";
import { requireSceneIndex } from "#src/tools/shared/validation/object-path-for-api.ts";

/** One clip of a scene, and the track holding it. */
export interface SceneClip {
  clip: LiveAPI;
  trackIndex: number;
}

/** What a scene holds, read once. */
export interface ScenePass {
  sceneIndex: number;
  /** Its clips on regular tracks, in track order */
  clips: SceneClip[];
  /** Where its Live 13 return-track clips sit ("rt0/s1"): they have no
   * arrangement lane, so a copy there leaves them out */
  returnClips: string[];
  /** The longest clip copy (pre-roll included), never under 4 beats, in Ableton beats */
  length: number;
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
    throw new Error(idDoesNotExist(sceneId, "scene"));
  }

  return requireSceneIndex(scene);
}

/**
 * Read a scene's clips and the length of the longest.
 * @param sceneIndex - Scene index
 * @returns The pass
 */
export function readSceneClips(sceneIndex: number): ScenePass {
  const trackCount = LiveAPI.from(livePath.liveSet).getChildIds(
    "tracks",
  ).length;
  const clips: SceneClip[] = [];
  // A scene is never shorter than 4 beats.
  let length = 4;

  for (const { clip, trackIndex } of regularSceneClips(
    sceneIndex,
    trackCount,
  )) {
    clips.push({ clip, trackIndex: trackIndex as number });
    length = Math.max(length, copyLengthBeats(clip));
  }

  const returnClips = returnSceneClips(sceneIndex).map(({ path }) => path);

  return { sceneIndex, clips, returnClips, length };
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
