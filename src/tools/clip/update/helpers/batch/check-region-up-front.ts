// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  markerBeatsPerUnit,
  markerClampSeconds,
} from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { getTimeSignature, resolveRegion } from "../clip-beat-positions.ts";
import { type ProcessSingleClipUpdateParams } from "./process-single-clip-update.ts";

/**
 * Refuse a start/length/firstStart the clip can't take, before anything is
 * written to it. The region write throws on these too, but by then the meter
 * and audio params have landed, so the clip is skipped half-changed.
 *
 * The meter is the one the call asks for; the region write checks again with
 * whatever Live kept. The audio params can flip `warping`, which changes the
 * marker unit and what `looping` was; those cases are worked out here without
 * writing.
 * @param params - The full single-clip update params
 * @throws Error when the region write would refuse the clip
 */
export function checkRegionUpFront(
  params: ProcessSingleClipUpdateParams,
): void {
  const { clip, start, length, firstStart, looping, warping, timeSignature } =
    params;

  if (start == null && length == null && firstStart == null) {
    return;
  }

  const { timeSigNumerator, timeSigDenominator } = getTimeSignature(
    timeSignature,
    clip,
  );
  const currentlyLooping = (clip.getProperty("looping") as number) > 0;
  const request = {
    start,
    length,
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
    clip,
    beatsPerMarkerUnit: markerBeatsPerUnit(clip),
    markerClampSeconds: markerClampSeconds(clip),
  };

  if ((clip.getProperty("is_audio_clip") as number) <= 0) {
    resolveRegion({
      ...request,
      isLooping: looping ?? currentlyLooping,
      wasLooping: currentlyLooping,
    });

    return;
  }

  const wasWarped = (clip.getProperty("warping") as number) > 0;
  // `looping: true` forces warping on, and vetoes `warping: false`.
  const isWarped = looping === true || (warping ?? wasWarped);

  if (isWarped === wasWarped) {
    resolveRegion({
      ...request,
      isLooping: looping ?? currentlyLooping,
      wasLooping: currentlyLooping,
    });
  } else if (looping === true) {
    // Warping turns on, and the markers' unit changes under the loop end. The
    // loop end is only left unchecked when `length` doesn't fix it.
    resolveRegion({
      ...request,
      isLooping: true,
      wasLooping: false,
      loopEndKnown: false,
    });
  } else {
    // Switching warping either way leaves the clip not looping (an unwarped
    // clip can't loop), so the loop end never comes into it.
    resolveRegion({ ...request, isLooping: false, wasLooping: false });
  }
}
