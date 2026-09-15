// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  createClipsForLength,
  parseArrangementLength,
} from "../clip/arrangement-length.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";

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
function forEachClipInScene(
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
 * Duplicate a scene
 * @param sceneIndex - Scene index to duplicate
 * @param name - Optional name for the duplicated scene
 * @param color - Optional color for the duplicated scene
 * @param withoutClips - Whether to exclude clips when duplicating
 * @returns Scene info object with id, path, and clips array
 */
export function duplicateScene(
  sceneIndex: number,
  name?: string,
  color?: string,
  withoutClips?: boolean,
): { id: string; path: string; clips: MinimalClipInfo[] } {
  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("duplicate_scene", sceneIndex);

  const newSceneIndex = sceneIndex + 1;
  const newScene = LiveAPI.from(livePath.scene(newSceneIndex));

  if (name != null) {
    newScene.set("name", name);
  }

  if (color != null) {
    newScene.setColor(color);
  }

  // Get all duplicated clips in this scene
  const duplicatedClips: MinimalClipInfo[] = [];
  const trackIds = liveSet.getChildIds("tracks");

  if (withoutClips === true) {
    // Delete all clips in the duplicated scene
    forEachClipInScene(newSceneIndex, trackIds, (_clip, clipSlot) => {
      clipSlot.call("delete_clip");
    });
  } else {
    // Default behavior: collect info about duplicated clips
    forEachClipInScene(newSceneIndex, trackIds, (clip) => {
      duplicatedClips.push(getMinimalClipInfo(clip));
    });
  }

  // Return optimistic metadata
  return {
    id: newScene.id,
    path: formatObjectPath({ kind: "scene", sceneIndex: newSceneIndex }),
    clips: duplicatedClips,
  };
}

/**
 * Calculate the length of a scene (longest clip in the scene)
 * @param sceneIndex - Scene index
 * @returns Length in Ableton beats
 */
export function calculateSceneLength(sceneIndex: number): number {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const trackIds = liveSet.getChildIds("tracks");

  let maxLength = 4; // Default minimum scene length

  forEachClipInScene(sceneIndex, trackIds, (clip) => {
    maxLength = Math.max(maxLength, clipLengthBeats(clip));
  });

  return maxLength;
}

/**
 * Duplicate a scene to the arrangement view
 * @param sceneId - Scene ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param name - Optional name for the duplicated clips
 * @param color - Optional color for the duplicated clips
 * @param withoutClips - Whether to exclude clips when duplicating
 * @param arrangementLength - Optional length (<count>bar, n<fraction>, or <count>bar+n<fraction>)
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @param context - Context object with silenceWavPath
 * @returns The clips the copy landed, each with its own path
 */
export async function duplicateSceneToArrangement(
  sceneId: string,
  arrangementStartBeats: number,
  name?: string,
  color?: string,
  withoutClips?: boolean,
  arrangementLength?: string,
  songTimeSigNumerator = 4,
  songTimeSigDenominator = 4,
  context: Partial<ToolContext & TilingContext> = {},
): Promise<{ clips: MinimalClipInfo[] }> {
  const scene = LiveAPI.from(sceneId);

  if (!scene.exists()) {
    throw new Error(`scene with id "${sceneId}" does not exist`);
  }

  const sceneIndex = scene.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(
      `no scene index for id "${sceneId}" (path="${scene.path}")`,
    );
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const trackIds = liveSet.getChildIds("tracks");

  const duplicatedClips: MinimalClipInfo[] = [];

  if (withoutClips !== true) {
    // Determine the length to use for all clips
    let arrangementLengthBeats: number;

    if (arrangementLength != null) {
      arrangementLengthBeats = parseArrangementLength(
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    } else {
      // Default to the length of the longest clip in the scene
      arrangementLengthBeats = calculateSceneLength(sceneIndex);
    }

    // Only duplicate clips if withoutClips is not explicitly true.
    // Gather the scene's clips first (forEachClipInScene is synchronous), then
    // process them sequentially so each createClipsForLength call can be awaited.
    const sceneClips: { clip: LiveAPI; trackIndex: number }[] = [];

    forEachClipInScene(sceneIndex, trackIds, (clip, _clipSlot, trackIndex) => {
      sceneClips.push({ clip, trackIndex });
    });

    for (const { clip, trackIndex } of sceneClips) {
      const track = LiveAPI.from(livePath.track(trackIndex));

      // The result reports id and path only: a clip takes the name verbatim,
      // so reading it back could only repeat the arg.
      const clipsForTrack = await createClipsForLength(
        clip,
        track,
        arrangementStartBeats,
        arrangementLengthBeats,
        songTimeSigNumerator,
        songTimeSigDenominator,
        name,
        context,
        color,
      );

      duplicatedClips.push(...clipsForTrack);
    }
  }

  return { clips: duplicatedClips };
}
