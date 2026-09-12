// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  prepareSessionClipSlot,
  requireCreatedClip,
  requireCreatedSessionClip,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";
import {
  arrangementPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-path-helpers.ts";

export interface AudioSessionClipResult {
  clip: LiveAPI;
  sceneIndex: number;
}

/**
 * Creates an audio clip in a session clip slot
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param sampleFile - Absolute path to audio file
 * @param liveSet - LiveAPI liveSet object
 * @param maxAutoCreatedScenes - Maximum number of scenes allowed
 * @returns Object with clip and sceneIndex
 */
export function createAudioSessionClip(
  trackIndex: number,
  sceneIndex: number,
  sampleFile: string,
  liveSet: LiveAPI,
  maxAutoCreatedScenes: number,
): AudioSessionClipResult {
  const clipSlot = prepareSessionClipSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    maxAutoCreatedScenes,
  );

  clipSlot.call("create_audio_clip", sampleFile);

  return {
    clip: requireCreatedSessionClip(clipSlot, slotPath(trackIndex, sceneIndex)),
    sceneIndex,
  };
}

export interface AudioArrangementClipResult {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
}

/**
 * Creates an audio clip in arrangement view on a track or take lane
 * @param trackIndex - Track index (0-based)
 * @param arrangementStartBeats - Start position in Ableton beats
 * @param sampleFile - Absolute path to audio file
 * @param takeLane - Take lane to create on, or null for the track's main lane
 * @param track - The already-resolved destination track, or null to resolve it
 * @returns Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex: number,
  arrangementStartBeats: number | null,
  sampleFile: string,
  takeLane: LiveAPI | null = null,
  track: LiveAPI | null = null,
): AudioArrangementClipResult {
  // Live API limit check
  if (
    arrangementStartBeats != null &&
    arrangementStartBeats > MAX_ARRANGEMENT_POSITION_BEATS
  ) {
    throw new Error(
      `arrangement position ${arrangementStartBeats} exceeds maximum allowed value of ${MAX_ARRANGEMENT_POSITION_BEATS}`,
    );
  }

  const target = takeLane ?? track ?? LiveAPI.from(livePath.track(trackIndex));

  // Create audio clip at position
  const newClipResult = target.call(
    "create_audio_clip",
    sampleFile,
    arrangementStartBeats,
  ) as string;
  const clip = requireCreatedClip(
    LiveAPI.from(newClipResult),
    arrangementPath(trackIndex, takeLane?.takeLaneIndex),
  );

  return { clip, arrangementStartBeats };
}
