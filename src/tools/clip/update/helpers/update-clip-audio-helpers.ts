// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyAudioTransform } from "#src/notation/transform/transform-audio-evaluator.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type AudioClipProperties,
  pitchShiftToCoarseFine,
  setAudioClipProperties,
} from "#src/tools/clip/helpers/audio-clip-properties.ts";
import { applyAudioClipWarping } from "#src/tools/clip/helpers/audio-clip-warping.ts";
import { dbToLiveGain, liveGainToDb } from "#src/tools/shared/gain-utils.ts";

interface AudioParams extends AudioClipProperties {
  /** Audio clip warping on/off */
  warping?: boolean;
  /** Requested looping state, which can veto `warping` (see below) */
  looping?: boolean;
}

/**
 * Sets audio-specific parameters on a clip
 * @param clip - The audio clip
 * @param params - Audio parameters
 * @param params.gainDb - Audio clip gain in decibels (-70 to 24)
 * @param params.pitchShift - Audio clip pitch shift in semitones (-48 to 48)
 * @param params.warpMode - Audio clip warp mode
 * @param params.warping - Audio clip warping on/off
 * @param params.looping - Requested looping state, which vetoes `warping: false`
 */
export function setAudioParameters(
  clip: LiveAPI,
  { gainDb, pitchShift, warpMode, warping, looping }: AudioParams,
): void {
  setAudioClipProperties(clip, { gainDb, pitchShift, warpMode });

  // `looping: true` forces warping back on, so a `warping: false` alongside it
  // is vetoed (forceWarpForLooping warns). Skip it here rather than let it run
  // and be overridden: the unwarp resets end_marker to the whole sample, and
  // re-warping maps that back as beats — collapsing the clip's region on the
  // way through, even though the flag ends up where it started.
  if (looping !== true) applyAudioClipWarping(clip, warping);
}

/**
 * Pre-apply the warp that `looping: true` forces on an audio clip.
 *
 * Live turns `warping` back on when you set `looping`, which flips the markers
 * from seconds to beats. Doing it up front keeps the region math on one side of
 * the switch — otherwise a region computed in seconds lands in properties Live
 * has already started reading as beats.
 *
 * @param clip - The audio clip
 * @param looping - Requested looping state
 * @param warping - Requested warp state, for the conflict warning
 */
export function forceWarpForLooping(
  clip: LiveAPI,
  looping: boolean | undefined,
  warping: boolean | undefined,
): void {
  if (looping !== true) return;

  // Warn before the already-warped bail-out: setAudioParameters skips the
  // vetoed unwarp entirely, so on a warped clip there is nothing left to do
  // here except say the flag was ignored.
  if (warping === false) {
    console.warn(
      `warping: false ignored for clip ${clip.id} - looping: true forces warping on`,
    );
  }

  if ((clip.getProperty("warping") as number) > 0) return;

  applyAudioClipWarping(clip, true);
}

/**
 * Apply transforms to audio clip gain and pitchShift
 * @param clip - The audio clip
 * @param transformString - Transform expressions
 * @param clipContext - Clip-level context for transform variables
 * @returns Whether any audio property was modified
 */
export function applyAudioTransforms(
  clip: LiveAPI,
  transformString: string | undefined,
  clipContext?: ClipContext,
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
    clipContext,
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
    const { coarse, fine } = pitchShiftToCoarseFine(result.pitchShift);

    clip.set("pitch_coarse", coarse);
    clip.set("pitch_fine", fine);
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
