// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
import { dbToLiveGain } from "#src/tools/shared/gain-utils.ts";

export interface AudioClipProperties {
  /** Audio clip gain in decibels (-70 to 24) */
  gainDb?: number;
  /** Audio clip pitch shift in semitones (-48 to 48) */
  pitchShift?: number;
  /** Audio clip warp mode */
  warpMode?: string;
}

const WARP_MODE_VALUES: Record<string, number> = {
  [WARP_MODE.BEATS]: LIVE_API_WARP_MODE_BEATS,
  [WARP_MODE.TONES]: LIVE_API_WARP_MODE_TONES,
  [WARP_MODE.TEXTURE]: LIVE_API_WARP_MODE_TEXTURE,
  [WARP_MODE.REPITCH]: LIVE_API_WARP_MODE_REPITCH,
  [WARP_MODE.COMPLEX]: LIVE_API_WARP_MODE_COMPLEX,
  [WARP_MODE.REX]: LIVE_API_WARP_MODE_REX,
  [WARP_MODE.PRO]: LIVE_API_WARP_MODE_PRO,
};

/**
 * Set the audio properties that are the same on create and update. Warping is
 * not here: it has order-dependent side effects on the clip region, so each
 * caller applies it at its own point in the sequence.
 * @param clip - The audio clip
 * @param params - Audio properties to set; each is skipped when undefined
 * @param params.gainDb - Audio clip gain in decibels (-70 to 24)
 * @param params.pitchShift - Audio clip pitch shift in semitones (-48 to 48)
 * @param params.warpMode - Audio clip warp mode
 */
export function setAudioClipProperties(
  clip: LiveAPI,
  { gainDb, pitchShift, warpMode }: AudioClipProperties,
): void {
  if (gainDb !== undefined) {
    clip.set("gain", dbToLiveGain(gainDb));
  }

  if (pitchShift !== undefined) {
    const { coarse, fine } = pitchShiftToCoarseFine(pitchShift);

    clip.set("pitch_coarse", coarse);
    clip.set("pitch_fine", fine);
  }

  if (warpMode !== undefined && WARP_MODE_VALUES[warpMode] !== undefined) {
    clip.set("warp_mode", WARP_MODE_VALUES[warpMode]);
  }
}

/**
 * Decomposes a fractional semitone pitch shift into Live's pitch_coarse
 * (integer semitones) and pitch_fine (cents).
 *
 * Rounds to the nearest semitone so the cents remainder stays within Live's
 * ±50 range. Flooring (the previous behavior) pushed the remainder up to +99
 * cents for negative shifts, which Live silently clamps to +50 — turning e.g.
 * -3.25 into -3.5.
 * @param pitchShift - Pitch shift in semitones (may be fractional)
 * @returns Coarse semitones and fine cents (each in [-50, 50])
 */
export function pitchShiftToCoarseFine(pitchShift: number): {
  coarse: number;
  fine: number;
} {
  const coarse = Math.round(pitchShift);
  const fine = Math.round((pitchShift - coarse) * 100);

  return { coarse, fine };
}
