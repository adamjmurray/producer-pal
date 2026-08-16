// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  isTakeLaneRequested,
  normalizeTakeLaneTarget,
  resolveTakeLane,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
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
 * Resolve the take lane per arrangement track. Returns a lane for each track
 * the request targets; an empty map means the main lane. Warns (and ignores
 * takeLane) for session-only requests and auto-creates lanes as needed. Like
 * the main lane, creating over an existing clip replaces/truncates it (no
 * overlap guard).
 * @param takeLane - Raw takeLane argument (0/null = main, 1+ = lane, "new")
 * @param takeLaneName - Name for a newly created lane
 * @param sessionSlotCount - Number of session slots in this request
 * @param arrangementPositions - Resolved arrangement track/position pairs
 * @returns Take lane LiveAPI keyed by track index, empty for the main lane
 */
export function resolveCreateClipTakeLanes(
  takeLane: number | string | null,
  takeLaneName: string | null,
  sessionSlotCount: number,
  arrangementPositions: ArrangementPosition[],
): Map<number, LiveAPI> {
  const lanes = new Map<number, LiveAPI>();

  // No arrangement positions to target: warn-and-ignore without validating the
  // value. Mirrors duplicate.ts's gate (takeLane is normalized only when it can
  // apply) so an LLM passing garbage on a session-only create doesn't throw.
  if (arrangementPositions.length === 0) {
    if (isTakeLaneRequested(takeLane)) {
      console.warn(
        "createClip: takeLane ignored for session clips (arrangement-only)",
      );
    }

    return lanes;
  }

  const target = normalizeTakeLaneTarget(takeLane);

  if (target == null) return lanes;

  if (sessionSlotCount > 0) {
    console.warn(
      "createClip: takeLane ignored for session clips (arrangement-only)",
    );
  }

  // "new" appends a lane, so resolve once per track rather than once per clip —
  // otherwise a track with two positions gets two fresh lanes.
  for (const trackIndex of new Set(
    arrangementPositions.map((position) => position.trackIndex),
  )) {
    const track = LiveAPI.from(livePath.track(trackIndex));
    const { lane, laneNumber } = resolveTakeLane(track, target, takeLaneName);

    lanes.set(trackIndex, lane);
    console.warn(
      `createClip: targeting take lane ${laneNumber} on track ${trackIndex}. Expand the take-lanes arrow on the track header in Live to see it.`,
    );
  }

  return lanes;
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
