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

/**
 * Resolve song/clip time signatures and convert timing parameters to beats.
 * Bundles the song time signature read, clip time signature resolution, and
 * bar|beat-to-beats conversion used at the start of clip creation.
 * @param liveSet - The live_set LiveAPI object
 * @param timeSignature - Custom clip time signature (e.g. "4/4"), or null
 * @param start - Loop start position in bar|beat format, or null
 * @param firstStart - First playback start in bar|beat format, or null
 * @param length - Clip length (Nbar, n<fraction>, or Nbar+n<fraction>), or null
 * @param looping - Whether the clip is looping
 * @returns Resolved time signatures and converted timing in beats
 */
export function resolveClipTimingContext(
  liveSet: LiveAPI,
  timeSignature: string | null,
  start: string | null,
  firstStart: string | null,
  length: string | null,
  looping: boolean | null,
): ClipTimingContext {
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
 * Resolve the take lane for arrangement clip creation. Returns the TakeLane to
 * create clips on, or null to use the main lane. Warns (and ignores takeLane)
 * for session-only requests and auto-creates lanes as needed. Like the main
 * lane, creating over an existing clip replaces/truncates it (no overlap guard).
 * @param takeLane - Raw takeLane argument (0/null = main, 1+ = lane, "new")
 * @param takeLaneName - Name for a newly created lane
 * @param sessionSlotCount - Number of session slots in this request
 * @param arrangementStarts - Parsed arrangement bar|beat positions
 * @param trackIndex - Arrangement track index
 * @returns The take lane LiveAPI, or null for the main lane
 */
export function resolveCreateClipTakeLane(
  takeLane: number | string | null,
  takeLaneName: string | null,
  sessionSlotCount: number,
  arrangementStarts: string[],
  trackIndex: number | null,
): LiveAPI | null {
  // No arrangement positions to target: warn-and-ignore without validating the
  // value. Mirrors duplicate.ts's gate (takeLane is normalized only when it can
  // apply) so an LLM passing garbage on a session-only create doesn't throw.
  if (arrangementStarts.length === 0 || trackIndex == null) {
    if (isTakeLaneRequested(takeLane)) {
      console.warn(
        "createClip: takeLane ignored for session clips (arrangement-only)",
      );
    }

    return null;
  }

  const target = normalizeTakeLaneTarget(takeLane);

  if (target == null) return null;

  if (sessionSlotCount > 0) {
    console.warn(
      "createClip: takeLane ignored for session clips (arrangement-only)",
    );
  }

  const track = LiveAPI.from(livePath.track(trackIndex));
  const { lane, laneNumber } = resolveTakeLane(track, target, takeLaneName);

  console.warn(
    `createClip: targeting take lane ${laneNumber}. Expand the take-lanes arrow on the track header in Live to see it.`,
  );

  return lane;
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
