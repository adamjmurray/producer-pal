// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Primitive helpers for arrangement clip operations.
 * These are low-level building blocks used by arrangement-tiling.ts
 * and arrangement-splitting.ts.
 */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { assertDefined, toLiveApiId } from "#src/tools/shared/utils.ts";

export interface TilingContext {
  /** Path to silence WAV file for audio clip operations */
  silenceWavPath: string;
}

interface SessionClipResult {
  clip: LiveAPI;
  slot: LiveAPI;
}

/**
 * Creates an audio clip in session view with controlled length.
 * Uses session view because create_audio_clip in arrangement doesn't support length control.
 *
 * @param track - LiveAPI track instance
 * @param targetLength - Desired clip length in beats
 * @param audioFilePath - Path to audio WAV file (can be silence.wav or actual audio)
 * @returns The created clip and slot in session view
 */
export function createAudioClipInSession(
  track: LiveAPI,
  targetLength: number,
  audioFilePath: string,
): SessionClipResult {
  const liveSet = LiveAPI.from(livePath.liveSet);
  let sceneIds = liveSet.getChildIds("scenes");
  const lastSceneId = assertDefined(sceneIds.at(-1), "last scene ID");
  const lastScene = LiveAPI.from(lastSceneId);

  // Check if last scene is empty, if not create a new one
  const isEmpty = lastScene.getProperty("is_empty") === 1;
  let workingSceneId = lastSceneId;

  if (!isEmpty) {
    const newSceneResult = liveSet.call("create_scene", sceneIds.length) as
      | string[]
      | string;

    // LiveAPI.call returns an array like ["id", "833"], join it with space to match getChildIds format
    workingSceneId = Array.isArray(newSceneResult)
      ? newSceneResult.join(" ")
      : newSceneResult;
    // Refresh scene IDs after creating new scene
    sceneIds = liveSet.getChildIds("scenes");
  }

  // Get track index to find corresponding clip slot
  const trackIndex = track.trackIndex as number;
  const sceneIndex = sceneIds.indexOf(workingSceneId);

  // Create clip in session slot with audio file
  const slot = LiveAPI.from(livePath.track(trackIndex).clipSlot(sceneIndex));

  // create_audio_clip requires a file path
  slot.call("create_audio_clip", audioFilePath);

  // Get the created clip by reconstructing the path
  const clip = LiveAPI.from(
    livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
  );

  // Enable warping and looping, then set length via loop_end
  clip.set("warping", 1);
  clip.set("looping", 1);
  clip.set("loop_end", targetLength);

  // Return both clip and slot for cleanup
  return { clip, slot };
}

/**
 * Creates and immediately deletes a temp clip at a position.
 * Used to trim adjacent clips via Ableton's overlap behavior.
 * For MIDI: creates directly in arrangement. For audio: creates in session then duplicates.
 * @param track - LiveAPI track instance
 * @param position - Position to create temp clip at
 * @param length - Length of temp clip in beats
 * @param isMidiClip - Whether the track is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 */
export function createAndDeleteTempClip(
  track: LiveAPI,
  position: number,
  length: number,
  isMidiClip: boolean,
  context: TilingContext,
): void {
  if (isMidiClip) {
    const tempResult = track.call("create_midi_clip", position, length) as [
      string,
      string | number,
    ];
    const tempClip = LiveAPI.from(tempResult);

    track.call("delete_clip", toLiveApiId(tempClip.id));
  } else {
    const { clip: sessionClip, slot } = createAudioClipInSession(
      track,
      length,
      context.silenceWavPath,
    );

    const tempResult = track.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sessionClip.id),
      position,
    ) as [string, string | number];
    const tempClip = LiveAPI.from(tempResult);

    slot.call("delete_clip");
    track.call("delete_clip", toLiveApiId(tempClip.id));
  }
}
