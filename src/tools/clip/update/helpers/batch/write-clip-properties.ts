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
import { noteClipColor, noteLanded } from "../entries/clip-reasons.ts";
import { type ProcessSingleClipUpdateParams } from "./process-single-clip-update.ts";

/**
 * Write the clip's name, color, meter, and loop region.
 *
 * Runs BEFORE duplicateLoop (see the caller). start/length can't reach here
 * alongside it — they pick what gets doubled, so the combination is refused up
 * front — but firstStart can, and it sets the playback marker
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

  // Each property says it landed as it does, so a later one that throws leaves
  // the clip's entry naming what stuck.
  const landed = (property: string): void =>
    noteLanded(reasons, landedPhrase(property), { id: clip.id });

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
    landed,
  );

  if (color != null) {
    noteClipColor(reasons, clip.id, landedColor(clip, color));
  }
}

/**
 * What a written clip property is called in an entry's account of what landed.
 * @param property - The Live property
 * @returns A few words for it
 */
function landedPhrase(property: string): string {
  if (property.startsWith("signature_")) {
    return "time signature";
  }

  return REGION_PROPERTIES.has(property) ? "region" : property;
}

const REGION_PROPERTIES = new Set([
  "loop_start",
  "loop_end",
  "start_marker",
  "end_marker",
]);
