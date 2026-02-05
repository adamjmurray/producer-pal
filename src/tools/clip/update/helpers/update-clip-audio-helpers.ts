// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { applyAudioTransform } from "#src/notation/transform/transform-audio-evaluator.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  LIVE_API_WARP_MODE_BEATS,
  LIVE_API_WARP_MODE_COMPLEX,
  LIVE_API_WARP_MODE_PRO,
  LIVE_API_WARP_MODE_REPITCH,
  LIVE_API_WARP_MODE_REX,
  LIVE_API_WARP_MODE_TEXTURE,
  LIVE_API_WARP_MODE_TONES,
  WARP_MODE,
} from "#src/tools/constants.ts";
import { dbToLiveGain, liveGainToDb } from "#src/tools/shared/gain-utils.ts";

// Re-export from shared location for backwards compatibility
export { revealAudioContentAtPosition } from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";

interface AudioParams {
  /** Audio clip gain in decibels (-70 to 24) */
  gainDb?: number;
  /** Audio clip pitch shift in semitones (-48 to 48) */
  pitchShift?: number;
  /** Audio clip warp mode */
  warpMode?: string;
  /** Audio clip warping on/off */
  warping?: boolean;
}

/**
 * Sets audio-specific parameters on a clip
 * @param clip - The audio clip
 * @param params - Audio parameters
 * @param params.gainDb - Audio clip gain in decibels (-70 to 24)
 * @param params.pitchShift - Audio clip pitch shift in semitones (-48 to 48)
 * @param params.warpMode - Audio clip warp mode
 * @param params.warping - Audio clip warping on/off
 */
export function setAudioParameters(
  clip: LiveAPI,
  { gainDb, pitchShift, warpMode, warping }: AudioParams,
): void {
  if (gainDb !== undefined) {
    const liveGain = dbToLiveGain(gainDb);

    clip.set("gain", liveGain);
  }

  if (pitchShift !== undefined) {
    const pitchCoarse = Math.floor(pitchShift);
    const pitchFine = Math.round((pitchShift - pitchCoarse) * 100);

    clip.set("pitch_coarse", pitchCoarse);
    clip.set("pitch_fine", pitchFine);
  }

  if (warpMode !== undefined) {
    const warpModeValue: Record<string, number> = {
      [WARP_MODE.BEATS]: LIVE_API_WARP_MODE_BEATS,
      [WARP_MODE.TONES]: LIVE_API_WARP_MODE_TONES,
      [WARP_MODE.TEXTURE]: LIVE_API_WARP_MODE_TEXTURE,
      [WARP_MODE.REPITCH]: LIVE_API_WARP_MODE_REPITCH,
      [WARP_MODE.COMPLEX]: LIVE_API_WARP_MODE_COMPLEX,
      [WARP_MODE.REX]: LIVE_API_WARP_MODE_REX,
      [WARP_MODE.PRO]: LIVE_API_WARP_MODE_PRO,
    };

    if (warpModeValue[warpMode] !== undefined) {
      clip.set("warp_mode", warpModeValue[warpMode]);
    }
  }

  if (warping !== undefined) {
    clip.set("warping", warping ? 1 : 0);
  }
}

/**
 * Apply transforms to audio clip gain and pitchShift
 * @param clip - The audio clip
 * @param transformString - Transform expressions
 * @returns Whether any audio property was modified
 */
export function applyAudioTransforms(
  clip: LiveAPI,
  transformString: string | undefined,
): boolean {
  if (!transformString) {
    return false;
  }

  // Read current values
  const currentLiveGain = clip.getProperty("gain") as number;
  const currentGainDb = liveGainToDb(currentLiveGain);

  const pitchCoarse = clip.getProperty("pitch_coarse") as number;
  const pitchFine = clip.getProperty("pitch_fine") as number;
  const currentPitchShift = pitchCoarse + pitchFine / 100;

  // Apply transforms
  const result = applyAudioTransform(
    currentGainDb,
    currentPitchShift,
    transformString,
  );

  let modified = false;

  // Apply gain if changed
  if (result.gain != null && result.gain !== currentGainDb) {
    const newLiveGain = dbToLiveGain(result.gain);

    clip.set("gain", newLiveGain);
    modified = true;
  }

  // Apply pitchShift if changed
  if (result.pitchShift != null && result.pitchShift !== currentPitchShift) {
    const newPitchCoarse = Math.floor(result.pitchShift);
    const newPitchFine = Math.round((result.pitchShift - newPitchCoarse) * 100);

    clip.set("pitch_coarse", newPitchCoarse);
    clip.set("pitch_fine", newPitchFine);
    modified = true;
  }

  return modified;
}

/**
 * Handles warp marker operations on a clip
 * @param clip - The audio clip
 * @param warpOp - Operation: add, move, or remove
 * @param warpBeatTime - Beat time for the warp marker
 * @param warpSampleTime - Sample time (for add operation)
 * @param warpDistance - Distance to move (for move operation)
 */
export function handleWarpMarkerOperation(
  clip: LiveAPI,
  warpOp: string,
  warpBeatTime: number | undefined,
  warpSampleTime?: number,
  warpDistance?: number,
): void {
  // Validate audio clip
  const hasAudioFile = clip.getProperty("file_path") != null;

  if (!hasAudioFile) {
    console.warn(
      `warp markers only available on audio clips (clip ${clip.id} is MIDI or empty)`,
    );

    return;
  }

  // Validate required parameters per operation
  if (warpBeatTime == null) {
    console.warn(`warpBeatTime required for ${warpOp} operation`);

    return;
  }

  switch (warpOp) {
    case "add": {
      // Add warp marker with optional sample time
      const args =
        warpSampleTime != null
          ? { beat_time: warpBeatTime, sample_time: warpSampleTime }
          : { beat_time: warpBeatTime };

      clip.call("add_warp_marker", args);
      break;
    }

    case "move": {
      if (warpDistance == null) {
        console.warn("warpDistance required for move operation");

        return;
      }

      clip.call("move_warp_marker", warpBeatTime, warpDistance);
      break;
    }

    case "remove": {
      clip.call("remove_warp_marker", warpBeatTime);
      break;
    }
  }
}
