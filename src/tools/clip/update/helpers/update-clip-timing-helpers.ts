// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  durationToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { markerBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";
import {
  targetLabel,
  targetLabelForId,
} from "#src/tools/shared/validation/object-path-for-api.ts";

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
  wasLooping: boolean;
  beatsPerMarkerUnit: number;
  markerClampSeconds: number;
}

interface TimeSignature {
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * Determine start_marker value with bounds checking
 * @param clipId - The clip being updated, for the warning
 * @param firstStartBeats - First start position in beats
 * @param startBeats - Start position in beats
 * @param endMarker - Clip end marker (content boundary)
 * @returns start_marker value or null if not applicable
 */
function determineStartMarker(
  clipId: string,
  firstStartBeats: number | null,
  startBeats: number | null,
  endMarker: number,
): number | null {
  if (firstStartBeats != null) {
    if (firstStartBeats < endMarker) {
      return firstStartBeats;
    }

    console.warn(
      `firstStart ignored for clip ${targetLabelForId(clipId)} - exceeds its content boundary (${firstStartBeats} >= ${endMarker})`,
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
 * @param args.isLooping - Whether the clip loops after this update
 * @param args.wasLooping - Whether the clip looped before this update
 * @param args.beatsPerMarkerUnit - Beats per marker unit (see markerBeatsPerUnit)
 * @param args.markerClampSeconds - Sample duration to clamp markers to (see markerClampSeconds)
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
  wasLooping,
  beatsPerMarkerUnit,
  markerClampSeconds,
}: CalculateBeatPositionsArgs): BeatPositions {
  let startBeats: number | null = null;
  let endBeats: number | null = null;
  let firstStartBeats: number | null = null;

  // Everything below is in beats, but the clip's markers may be seconds — read
  // them through this so an unwarped audio clip lands on the same scale. The
  // clamp matters as much as the factor: read-clip reports a clamped length, so
  // handing that length straight back has to derive from the same number.
  const readMarker = (property: string) =>
    markerBeats(clip, property, { beatsPerMarkerUnit, markerClampSeconds });

  // Live keeps two regions per clip and `looping` picks which one plays:
  // start_marker/end_marker while it is off, loop_start/loop_end while it is
  // on. Read the pair that is playing BEFORE this update — on a loop toggle the
  // other pair still holds whatever it was last left with.
  const currentStart = readMarker(wasLooping ? "loop_start" : "start_marker");
  const currentEnd = readMarker(wasLooping ? "loop_end" : "end_marker");

  // Convert start to beats if provided. Validate the standalone position first
  // so a 0-indexed/zero-bar position gets the 1-indexing steer (matching
  // create-clip's start), not a silent pre-origin beat.
  if (start != null) {
    validateBarBeatPosition(start);
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Calculate end from start + length
  if (length != null) {
    const lengthBeats = durationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );

    // If start not provided, read current value from clip
    if (startBeats == null) {
      if (wasLooping) {
        startBeats = currentStart;
      } else {
        // For non-looping clips, derive from end_marker - length
        const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;

        startBeats = currentEnd - lengthBeats;

        // Sanity check for MIDI clips only - audio clips have length based on sample duration
        if (
          isMidiClip &&
          Math.abs(startBeats - currentStart) > SAME_TIME_EPSILON
        ) {
          console.warn(
            `clip ${targetLabel(clip)}: derived start (${startBeats}) differs from current start_marker (${currentStart})`,
          );
        }
      }
    }

    endBeats = startBeats + lengthBeats;
  }

  // A loop toggle swaps which pair plays, and Live reveals the other pair's old
  // values instead of carrying the region over. Restate the region that was
  // playing, so `looping` changes the loop flag and nothing else (ADR-0020).
  if (isLooping !== wasLooping) {
    startBeats ??= currentStart;
    endBeats ??= currentEnd;
  }

  // Handle firstStart for looping clips
  if (firstStart != null && isLooping) {
    validateBarBeatPosition(firstStart);
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Determine start_marker value (must be < end_marker content boundary).
  // Bound it by the end this update is writing rather than the stale one — an
  // expanding write moves the end first (see buildClipPropertiesToSet).
  const startMarkerBeats = determineStartMarker(
    clip.id,
    firstStartBeats,
    startBeats,
    endBeats ?? readMarker("end_marker"),
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
