// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  abletonBeatsToBarBeat,
  abletonBeatsToDuration,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { clipRegionBeats } from "./clip-region-and-warp.ts";

/** A clip's own meter, which spells both its positions and its notes. */
export interface ClipMeter {
  numerator: number;
  denominator: number;
}

/** The timing fields of a clip read. */
export interface TimingFields {
  timeSignature?: string | null;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  firstStart?: string;
}

/**
 * Add timing properties (timeSignature, looping, start, end, length, firstStart)
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param isAudioClip - Whether the clip is an audio clip, whose marker
 *   properties are in seconds rather than beats when it is not warped
 * @param clipMeter - Getter for the clip's meter
 */
export function addTimingProperties(
  result: TimingFields,
  clip: LiveAPI,
  isAudioClip: boolean,
  clipMeter: () => ClipMeter,
): void {
  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    clipMeter();
  const isLooping = (clip.getProperty("looping") as number) > 0;

  const { startBeats, endBeats, startMarkerBeats } = clipRegionBeats(
    clip,
    isAudioClip,
    isLooping,
  );

  result.timeSignature = `${String(timeSigNumerator)}/${String(timeSigDenominator)}`;
  result.looping = isLooping;
  result.start = abletonBeatsToBarBeat(
    startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  result.end = abletonBeatsToBarBeat(
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  result.length = abletonBeatsToDuration(
    endBeats - startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  if (Math.abs(startMarkerBeats - startBeats) > SAME_TIME_EPSILON) {
    result.firstStart = abletonBeatsToBarBeat(
      startMarkerBeats,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
}
