// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { refuseArrangementPositionPastCap } from "#src/tools/shared/validation/helpers/arrangement-position-cap.ts";
import { parseKeptTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { type ArrangementPosition } from "./create-clip-destinations.ts";
import { convertTimingParameters } from "./timing-parameters.ts";

/** The song's meter, read once per call — every clip's positions share it. */
export interface SongMeter {
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
}

export interface ClipTimingContext {
  timeSigNumerator: number;
  timeSigDenominator: number;
  startBeats: number | null;
  firstStartBeats: number | null;
  endBeats: number | null;
  /** Whether firstStart was sent for a clip that won't loop, so it did nothing */
  firstStartIgnored: boolean;
}

/** The MIDI-only timing params, as the tool received them. */
export interface ClipTimingParams {
  /** Loop start position in bar|beat format, or null */
  start: string | null;
  /** First playback start in bar|beat format, or null */
  firstStart: string | null;
  /** Clip length (<count>bar, n<fraction>, or <count>bar+n<fraction>), or null */
  length: string | null;
  /** Whether the clip is looping */
  looping: boolean | null;
}

/**
 * Resolve one clip's time signature and convert its timing parameters to beats.
 *
 * Runs per clip: timeSignature, start, length and firstStart all pair 1:1 with
 * the positions the call names, so two clips in one call can be on different
 * meters and regions.
 * @param song - The song's meter, read once for the call
 * @param timeSignature - Custom clip time signature (e.g. "4/4"), or null
 * @param sampleFile - Audio file path, or null for a MIDI clip
 * @param timing - The MIDI-only timing params, ignored for an audio clip
 * @returns The clip's meter, its timing in beats, and whether firstStart did nothing
 */
export function resolveClipTimingContext(
  song: SongMeter,
  timeSignature: string | null,
  sampleFile: string | null,
  timing: ClipTimingParams,
): ClipTimingContext {
  // An audio clip takes its region from the sample, so create-clip has already
  // warned these as ignored. Don't parse them: a malformed one would throw on a
  // param we skipped, where the rule is warn and carry on. timeSignature still
  // applies to audio, so it stays.
  // Truthiness, not a null check: an empty sampleFile makes a MIDI clip.
  const { start, firstStart, length, looping } = sampleFile
    ? { start: null, firstStart: null, length: null, looping: null }
    : timing;

  const { songTimeSigNumerator, songTimeSigDenominator } = song;

  const { timeSigNumerator, timeSigDenominator } = resolveTimeSignature(
    timeSignature,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const { startBeats, firstStartBeats, endBeats, firstStartIgnored } =
    convertTimingParameters(
      null, // arrangementStart converted per-position
      start,
      firstStart,
      length,
      looping,
      timeSigNumerator,
      timeSigDenominator,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

  return {
    timeSigNumerator,
    timeSigDenominator,
    startBeats,
    firstStartBeats,
    endBeats,
    firstStartIgnored,
  };
}

/**
 * Read the song's meter, once for the whole call.
 * @param liveSet - The live_set LiveAPI object
 * @returns The song time signature
 */
export function readSongMeter(liveSet: LiveAPI): SongMeter {
  return {
    songTimeSigNumerator: liveSet.getProperty("signature_numerator") as number,
    songTimeSigDenominator: liveSet.getProperty(
      "signature_denominator",
    ) as number,
  };
}

/**
 * Refuses the whole call when any arrangement position won't parse or is past
 * the last one Live allows, MIDI and audio alike.
 *
 * Positions are converted per clip in the create loop, but a bad one has to be
 * caught before anything exists. Past the first clip — or the first take lane,
 * which Live can't delete — the error is all the caller gets back, and it names
 * none of what was left behind.
 * @param arrangementPositions - Resolved arrangement destinations
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @throws When a position isn't a usable bar|beat, or is past Live's last
 */
export function validateArrangementPositions(
  arrangementPositions: ArrangementPosition[],
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): void {
  for (const { arrangementStart } of arrangementPositions) {
    // The 1-indexing steer first, then the format error the conversion raises.
    validateBarBeatPosition(arrangementStart);
    refuseArrangementPositionPastCap(
      barBeatToAbletonBeats(
        arrangementStart,
        songTimeSigNumerator,
        songTimeSigDenominator,
      ),
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  }
}

// --- Helpers below main exports ---

/**
 * Resolve clip time signature from parameter or song defaults.
 * @param timeSignature - Custom time signature string (e.g. "4/4"), or null
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @returns Resolved numerator and denominator
 */
function resolveTimeSignature(
  timeSignature: string | null,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): { timeSigNumerator: number; timeSigDenominator: number } {
  if (timeSignature != null) {
    const parsed = parseKeptTimeSignature(timeSignature);

    return {
      timeSigNumerator: parsed.numerator,
      timeSigDenominator: parsed.denominator,
    };
  }

  return {
    timeSigNumerator: songTimeSigNumerator,
    timeSigDenominator: songTimeSigDenominator,
  };
}
