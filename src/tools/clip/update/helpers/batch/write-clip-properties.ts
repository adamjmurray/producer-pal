// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  markerBeats,
  markerBeatsPerUnit,
  markerClampSeconds,
} from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import { buildClipPropertiesToSet } from "../clip-properties-to-set.ts";
import { calculateBeatPositions } from "../clip-beat-positions.ts";
import { noteClipColor } from "../entries/clip-reasons.ts";
import { type ProcessSingleClipUpdateParams } from "./process-single-clip-update.ts";

/**
 * Write the clip's name, color, meter, and loop region.
 *
 * Runs BEFORE duplicateLoop (see the caller). start/length can't reach here
 * alongside it — they pick what gets doubled, so the combination is refused up
 * front (ADR-0040) — but firstStart can, and it sets the playback marker
 * without moving the region.
 *
 * @param params - The full single-clip update params
 * @param resolved - Derived per-clip values not present on params
 * @param resolved.timeSigNumerator - Resolved time signature numerator
 * @param resolved.timeSigDenominator - Resolved time signature denominator
 * @param resolved.isLooping - The clip's looping state after this update
 * @param resolved.wasLooping - The clip's looping state before this update
 */
export function writeClipProperties(
  params: ProcessSingleClipUpdateParams,
  {
    timeSigNumerator,
    timeSigDenominator,
    isLooping,
    wasLooping,
  }: {
    timeSigNumerator: number;
    timeSigDenominator: number;
    isLooping: boolean;
    wasLooping: boolean;
  },
): void {
  const {
    clip,
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    reasons,
  } = params;
  const markerScale = {
    beatsPerMarkerUnit: markerBeatsPerUnit(clip),
    markerClampSeconds: markerClampSeconds(clip),
  };

  // Includes the end_marker bounds check for start_marker
  const { startBeats, endBeats, startMarkerBeats } = calculateBeatPositions({
    start,
    length,
    firstStart,
    reasons,
    timeSigNumerator,
    timeSigDenominator,
    clip,
    isLooping,
    wasLooping,
    ...markerScale,
  });

  // Both ends: loop_start and start_marker are bounded by different properties,
  // and one call can write both.
  const readMarker = (property: string) =>
    markerBeats(clip, property, markerScale);

  clip.setAll(
    buildClipPropertiesToSet({
      name,
      color,
      timeSignature,
      timeSigNumerator,
      timeSigDenominator,
      startMarkerBeats,
      looping,
      isLooping,
      wasLooping,
      startBeats,
      endBeats,
      currentLoopEnd: readMarker("loop_end"),
      currentEndMarker: readMarker("end_marker"),
      beatsPerMarkerUnit: markerScale.beatsPerMarkerUnit,
    }),
  );

  if (color != null) {
    noteClipColor(reasons, clip.id, landedColor(clip, color));
  }
}
