// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  resolveTakeLane,
  takeLaneKey,
  takeLaneTargetsThatFit,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";
import { type ArrangementPosition } from "./create-clip-destination-helpers.ts";
import { convertTimingParameters } from "./create-clip-helpers.ts";

export interface ClipTimingContext {
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
  startBeats: number | null;
  firstStartBeats: number | null;
  endBeats: number | null;
}

/** The MIDI-only timing params, as the tool received them. */
export interface ClipTimingParams {
  /** Loop start position in bar|beat format, or null */
  start: string | null;
  /** First playback start in bar|beat format, or null */
  firstStart: string | null;
  /** Clip length (Nbar, n<fraction>, or Nbar+n<fraction>), or null */
  length: string | null;
  /** Whether the clip is looping */
  looping: boolean | null;
}

/**
 * Resolve song/clip time signatures and convert timing parameters to beats.
 * Bundles the song time signature read, clip time signature resolution, and
 * bar|beat-to-beats conversion used at the start of clip creation.
 * @param liveSet - The live_set LiveAPI object
 * @param timeSignature - Custom clip time signature (e.g. "4/4"), or null
 * @param sampleFile - Audio file path, or null for a MIDI clip
 * @param timing - The MIDI-only timing params, ignored for an audio clip
 * @returns Resolved time signatures and converted timing in beats
 */
export function resolveClipTimingContext(
  liveSet: LiveAPI,
  timeSignature: string | null,
  sampleFile: string | null,
  timing: ClipTimingParams,
): ClipTimingContext {
  // An audio clip takes its region from the sample, so create-clip has already
  // warned these as ignored. Don't parse them: a malformed one would throw on a
  // param we skipped, where the rule is warn and carry on. timeSignature still
  // applies to audio, so it stays.
  const { start, firstStart, length, looping } =
    sampleFile != null
      ? { start: null, firstStart: null, length: null, looping: null }
      : timing;

  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  const { timeSigNumerator, timeSigDenominator } = resolveTimeSignature(
    timeSignature,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  const { startBeats, firstStartBeats, endBeats } = convertTimingParameters(
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
    songTimeSigNumerator,
    songTimeSigDenominator,
    timeSigNumerator,
    timeSigDenominator,
    startBeats,
    firstStartBeats,
    endBeats,
  };
}

/**
 * Refuses the whole call when any arrangement position won't parse.
 *
 * Positions are converted per clip in the create loop, but a bad one has to be
 * caught before anything exists. Past the first clip — or the first take lane,
 * which Live can't delete — the error is all the caller gets back, and it names
 * none of what was left behind.
 * @param arrangementPositions - Resolved arrangement destinations
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @throws When a position isn't a usable bar|beat
 */
export function validateArrangementPositions(
  arrangementPositions: ArrangementPosition[],
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): void {
  for (const { arrangementStart } of arrangementPositions) {
    // The 1-indexing steer first, then the format error the conversion raises.
    validateBarBeatPosition(arrangementStart);
    barBeatToAbletonBeats(
      arrangementStart,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  }
}

/**
 * Resolve the take lane each arrangement destination names, auto-creating lanes
 * as needed. Like the main lane, creating over an existing clip
 * replaces/truncates it (no overlap guard). A destination whose lane doesn't
 * fit is warned and left out, so the clips around it still get made.
 * @param takeLaneName - Name for a newly created lane
 * @param arrangementPositions - Resolved arrangement destinations
 * @returns Take lane LiveAPI keyed by {@link takeLaneKey}, empty for main lanes
 */
export function resolveCreateClipTakeLanes(
  takeLaneName: string | null,
  arrangementPositions: ArrangementPosition[],
): Map<string, LiveAPI> {
  const lanes = new Map<string, LiveAPI>();

  // Lanes are permanent (Live has no delete), so pick the whole call's
  // destinations before creating a lane on any of it — otherwise a cap failure
  // on the last destination strands empty lanes on all the earlier ones.
  const fitting = takeLaneTargetsThatFit(arrangementPositions, "createClip");

  // Resolve once per destination rather than once per clip — otherwise a single
  // "l+" covering three arrangementStarts gets three fresh lanes.
  for (const position of fitting) {
    const { trackIndex, takeLane: target } = position;
    const key = takeLaneKey(position);

    if (lanes.has(key)) continue;

    const { lane, laneIndex } = resolveTakeLane(
      trackFor(position),
      target,
      takeLaneName,
    );

    lanes.set(key, lane);
    console.warn(
      `createClip: targeting take lane "t${trackIndex}/l${laneIndex}". Expand the take-lanes arrow on the track header in Live to see it.`,
    );
  }

  return lanes;
}

// --- Helpers below main exports ---

/**
 * The Live API track an arrangement destination sits on.
 * @param position - An arrangement destination
 * @returns The track LiveAPI
 */
function trackFor(position: ArrangementPosition): LiveAPI {
  return LiveAPI.from(livePath.track(position.trackIndex));
}

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
    const parsed = parseTimeSignature(timeSignature);

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
