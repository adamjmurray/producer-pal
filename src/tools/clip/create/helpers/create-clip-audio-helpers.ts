// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { prepareSessionClipSlot } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";

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
    clip: LiveAPI.from(`${clipSlot.path} clip`),
    sceneIndex,
  };
}

export interface AudioArrangementClipResult {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
}

/**
 * Creates an audio clip in arrangement view
 * @param trackIndex - Track index (0-based)
 * @param arrangementStartBeats - Start position in Ableton beats
 * @param sampleFile - Absolute path to audio file
 * @returns Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex: number,
  arrangementStartBeats: number | null,
  sampleFile: string,
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

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  // Create audio clip at position
  const newClipResult = track.call(
    "create_audio_clip",
    sampleFile,
    arrangementStartBeats,
  ) as string;
  const clip = LiveAPI.from(newClipResult);

  if (!clip.exists()) {
    throw new Error("failed to create audio Arrangement clip");
  }

  return { clip, arrangementStartBeats };
}
