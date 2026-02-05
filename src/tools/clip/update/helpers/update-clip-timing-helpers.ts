// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";

interface BeatPositions {
  startBeats: number | null;
  endBeats: number | null;
  firstStartBeats: number | null;
  startMarkerBeats: number | null;
}

interface CalculateBeatPositionsArgs {
  start?: string;
  length?: string;
  firstStart?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
  clip: LiveAPI;
  isLooping: boolean;
}

interface TimeSignature {
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * Determine start_marker value with bounds checking
 * @param firstStartBeats - First start position in beats
 * @param startBeats - Start position in beats
 * @param endMarker - Clip end marker (content boundary)
 * @returns start_marker value or null if not applicable
 */
function determineStartMarker(
  firstStartBeats: number | null,
  startBeats: number | null,
  endMarker: number,
): number | null {
  if (firstStartBeats != null) {
    if (firstStartBeats < endMarker) {
      return firstStartBeats;
    }

    console.warn(
      `firstStart parameter ignored - exceeds clip content boundary (${firstStartBeats} >= ${endMarker})`,
    );

    return null;
  }

  if (startBeats != null && startBeats < endMarker) {
    return startBeats;
  }

  return null;
}

/**
 * Calculate beat positions from bar|beat notation
 * @param args - Calculation arguments
 * @param args.start - Start position in bar|beat notation
 * @param args.length - Length in bar|beat notation
 * @param args.firstStart - First start position in bar|beat notation
 * @param args.timeSigNumerator - Time signature numerator
 * @param args.timeSigDenominator - Time signature denominator
 * @param args.clip - The clip to read defaults from
 * @param args.isLooping - Whether clip is looping
 * @returns Beat positions
 */
export function calculateBeatPositions({
  start,
  length,
  firstStart,
  timeSigNumerator,
  timeSigDenominator,
  clip,
  isLooping,
}: CalculateBeatPositionsArgs): BeatPositions {
  let startBeats: number | null = null;
  let endBeats: number | null = null;
  let firstStartBeats: number | null = null;

  // Convert start to beats if provided
  if (start != null) {
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Calculate end from start + length
  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );

    // If start not provided, read current value from clip
    if (startBeats == null) {
      if (isLooping) {
        startBeats = clip.getProperty("loop_start") as number;
      } else {
        // For non-looping clips, derive from end_marker - length
        const currentEndMarker = clip.getProperty("end_marker") as number;
        const currentStartMarker = clip.getProperty("start_marker") as number;
        const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;

        startBeats = currentEndMarker - lengthBeats;

        // Sanity check for MIDI clips only - audio clips have length based on sample duration
        if (isMidiClip && Math.abs(startBeats - currentStartMarker) > 0.001) {
          console.warn(
            `Derived start (${startBeats}) differs from current start_marker (${currentStartMarker})`,
          );
        }
      }
    }

    endBeats = startBeats + lengthBeats;
  }

  // Handle firstStart for looping clips
  if (firstStart != null && isLooping) {
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Determine start_marker value (must be < end_marker content boundary)
  const endMarker = clip.getProperty("end_marker") as number;
  const startMarkerBeats = determineStartMarker(
    firstStartBeats,
    startBeats,
    endMarker,
  );

  return { startBeats, endBeats, firstStartBeats, startMarkerBeats };
}

/**
 * Get time signature values from parameter or clip
 * @param timeSignature - Time signature string from params
 * @param clip - The clip to read defaults from
 * @returns Time signature values
 */
export function getTimeSignature(
  timeSignature: string | undefined,
  clip: LiveAPI,
): TimeSignature {
  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    return {
      timeSigNumerator: parsed.numerator,
      timeSigDenominator: parsed.denominator,
    };
  }

  return {
    timeSigNumerator: clip.getProperty("signature_numerator") as number,
    timeSigDenominator: clip.getProperty("signature_denominator") as number,
  };
}
