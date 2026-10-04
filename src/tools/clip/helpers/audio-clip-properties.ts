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
import {
  dbToLiveGain,
  liveGainToDb,
} from "#src/tools/shared/helpers/gain-conversion.ts";
import { differsAtPublishedResolution } from "#src/tools/shared/helpers/read-back-comparison.ts";
import {
  asFiniteNumber,
  round2dp,
} from "#src/tools/shared/helpers/rounding.ts";

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
  if (gainDb != null) {
    clip.set("gain", dbToLiveGain(gainDb));
  }

  if (pitchShift != null) {
    const { coarse, fine } = pitchShiftToCoarseFine(pitchShift);

    clip.set("pitch_coarse", coarse);
    clip.set("pitch_fine", fine);
  }

  if (warpMode != null && WARP_MODE_VALUES[warpMode] !== undefined) {
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

/** The audio values Live kept in place of the ones asked for. */
export type AudioReadBack = {
  gainDb?: number;
  pitchShift?: number;
  warpMode?: string;
};

/** How far a raw gain can sit from the one written and still be it. */
const GAIN_TOLERANCE = 1e-4;

/**
 * Read back the audio values a call just wrote, and keep only the ones Live
 * didn't take as asked, in the units the read tools publish. Gain is compared
 * raw: the dB table is approximate, so a round trip through it says nothing
 * about what Live did.
 * @param clip - The audio clip
 * @param requested - What the call asked for; an unset value is not checked
 * @param requested.gainDb - The gain in decibels asked for
 * @param requested.pitchShift - The pitch shift in semitones asked for
 * @param requested.warpMode - The warp mode asked for
 * @returns The values that read back differently
 */
export function readBackAudioClipProperties(
  clip: LiveAPI,
  { gainDb, pitchShift, warpMode }: AudioClipProperties,
): AudioReadBack {
  const shown: AudioReadBack = {};

  if (gainDb != null) {
    const raw = asFiniteNumber(clip.getProperty("gain"));

    if (raw != null && Math.abs(raw - dbToLiveGain(gainDb)) > GAIN_TOLERANCE) {
      shown.gainDb = round2dp(liveGainToDb(raw));
    }
  }

  if (pitchShift != null) {
    const coarse = asFiniteNumber(clip.getProperty("pitch_coarse"));
    const fine = asFiniteNumber(clip.getProperty("pitch_fine"));
    const landed =
      coarse != null && fine != null ? coarse + fine / 100 : undefined;

    if (
      landed != null &&
      differsAtPublishedResolution(pitchShift, landed, round2dp)
    ) {
      shown.pitchShift = landed;
    }
  }

  if (warpMode != null && WARP_MODE_VALUES[warpMode] !== undefined) {
    const raw = asFiniteNumber(clip.getProperty("warp_mode"));

    if (raw != null && raw !== WARP_MODE_VALUES[warpMode]) {
      shown.warpMode = warpModeName(raw);
    }
  }

  return shown;
}

/**
 * The name a read publishes for a warp mode.
 * @param value - Live's warp mode number
 * @returns The mode's name, or "unknown"
 */
function warpModeName(value: number): string {
  return (
    Object.entries(WARP_MODE_VALUES).find(([, mode]) => mode === value)?.[0] ??
    "unknown"
  );
}
