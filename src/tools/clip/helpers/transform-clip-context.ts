// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";

export interface TransformClipContextInput {
  /** Region length (end minus start) in Ableton beats */
  regionLengthBeats: number;
  clipIndex: number;
  clipCount: number;
  /** Arrangement start in Ableton beats, or undefined for session clips */
  arrangementStartBeats: number | undefined;
  /** Note time where the region starts, in Ableton beats; omitted for audio */
  startMarkerBeats: number | undefined;
  /** Note time where playback stops, in Ableton beats; omitted for audio */
  clipEndBeats: number | undefined;
  timeSigNumerator: number;
  timeSigDenominator: number;
  scalePitchClassMask: number | undefined;
}

/**
 * Build the `clip.*` transform context. Shared by create and update so
 * `clip.duration` (the region's length, not its end) can't differ between them.
 * @param input - Clip facts in Ableton beats
 * @returns ClipContext in musical beats
 */
export function buildTransformClipContext(
  input: TransformClipContextInput,
): ClipContext {
  const beatScale = input.timeSigDenominator / 4;
  const scale = (beats: number | undefined): number | undefined =>
    beats == null ? undefined : beats * beatScale;

  return {
    clipDuration: input.regionLengthBeats * beatScale,
    clipIndex: input.clipIndex,
    clipCount: input.clipCount,
    arrangementStart: scale(input.arrangementStartBeats),
    startMarker: scale(input.startMarkerBeats),
    clipEnd: scale(input.clipEndBeats),
    barDuration: input.timeSigNumerator,
    timeSigDenominator: input.timeSigDenominator,
    scalePitchClassMask: input.scalePitchClassMask,
  };
}
