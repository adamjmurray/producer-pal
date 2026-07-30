// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  audioClipPlayedSeconds,
  audioClipSampleSeconds,
  audioClipTiming,
} from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { prepareSessionClipSlot } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";

/** Time-stretch below which a warped clip counts as playing "as rendered", in
 * seconds. Live's warp grid lands a hair off exact, so an exact comparison
 * would warn about clips that are effectively 1:1. */
const STRETCH_TOLERANCE_SECONDS = 0.01;

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
 * Creates an audio clip in arrangement view on a track or take lane
 * @param trackIndex - Track index (0-based)
 * @param arrangementStartBeats - Start position in Ableton beats
 * @param sampleFile - Absolute path to audio file
 * @param takeLane - Take lane to create on, or null for the track's main lane
 * @returns Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex: number,
  arrangementStartBeats: number | null,
  sampleFile: string,
  takeLane: LiveAPI | null = null,
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

  const target = takeLane ?? LiveAPI.from(livePath.track(trackIndex));

  // Create audio clip at position
  const newClipResult = target.call(
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

/**
 * Settle a freshly created audio clip's warp state.
 *
 * Live decides for itself whether to warp an imported sample, following the
 * user's "Loop/Warp Short Samples" setting — which the Live API cannot read. So
 * an unspecified `warping` leaves Live's choice alone and warns when that
 * choice time-stretches the file, and an explicit value overrides it.
 *
 * @param clip - The newly created audio clip
 * @param warping - Requested warp state, or null to keep Live's own choice
 */
export function applyAudioClipWarping(
  clip: LiveAPI,
  warping: boolean | null,
): void {
  if (warping === false) {
    unwarpAudioClip(clip);

    return;
  }

  if (warping === true) {
    // Switching warp on converts the markers from seconds to beats, so the
    // region still spans the whole sample afterward
    clip.set("warping", 1);
  }

  warnAudioClipStretch(clip);
}

/**
 * Turn warping off and restate the end marker in seconds.
 *
 * Live reinterprets the marker properties as seconds without converting them,
 * so the end marker keeps whatever number the warped beat grid had put there.
 * Playback is unharmed — Live clamps at the file boundary — but the readable
 * region is wrong, and switching warp back on would convert that stale number
 * into beats and inflate the region.
 *
 * @param clip - The audio clip to unwarp
 */
function unwarpAudioClip(clip: LiveAPI): void {
  clip.set("warping", 0);

  const sampleSeconds = audioClipSampleSeconds(clip);

  if (sampleSeconds > 0) {
    clip.set("end_marker", sampleSeconds);
  }
}

/**
 * Warn when Live's warp grid makes a clip play at a different duration than the
 * file was rendered at. Silent when the clip plays as rendered.
 * @param clip - The newly created audio clip
 */
function warnAudioClipStretch(clip: LiveAPI): void {
  const timing = audioClipTiming(clip);

  if (!timing.warping || timing.sampleSeconds <= 0) return;

  const playedSeconds = audioClipPlayedSeconds(timing);

  if (
    Math.abs(playedSeconds - timing.sampleSeconds) < STRETCH_TOLERANCE_SECONDS
  ) {
    return;
  }

  console.warn(
    `audio clip is warped: Live plays the ${timing.sampleSeconds.toFixed(2)}s ` +
      `sample over ${playedSeconds.toFixed(2)}s, time-stretching it. ` +
      `Pass warping:false to play it as rendered`,
  );
}
