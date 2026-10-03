// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  abletonBeatsToDuration,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { clipRegionBeats } from "#src/tools/clip/read/helpers/clip-region-and-warp.ts";
import { differsAtPublishedResolution } from "#src/tools/shared/helpers/read-back-comparison.ts";
import { roundBeats } from "#src/tools/shared/helpers/rounding.ts";
import { type ClipReasons, noteClipReadBack } from "../entries/clip-reasons.ts";

/** The clip's meter. */
interface ClipMeter {
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/** The region a call asked for, in beats; null for what it didn't ask. */
export interface RequestedRegion {
  startBeats: number | null;
  lengthBeats: number | null;
}

/**
 * Read the region back after it was written, and say so on the clip's entry
 * when Live kept a different one (`start`, `length`, in the clip's meter). Live
 * ignores a region it can't hold and keeps the old one, so the write alone
 * doesn't say what the clip has.
 * @param clip - The clip
 * @param reasons - What each clip has to say, added to
 * @param region - What the call asked for
 * @param meter - The clip's meter
 * @param meter.timeSigNumerator - Beats per bar
 * @param meter.timeSigDenominator - The beat's note value
 * @param isLooping - Whether the clip loops now, which picks the pair to read
 */
export function noteRegionReadBack(
  clip: LiveAPI,
  reasons: ClipReasons,
  region: RequestedRegion,
  { timeSigNumerator, timeSigDenominator }: ClipMeter,
  isLooping: boolean,
): void {
  if (region.startBeats == null && region.lengthBeats == null) {
    return;
  }

  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;
  const landed = clipRegionBeats(clip, isAudioClip, isLooping);
  const shown: Record<string, string> = {};

  if (
    region.startBeats != null &&
    differsAtPublishedResolution(
      region.startBeats,
      landed.startBeats,
      roundBeats,
      true,
    )
  ) {
    shown.start = abletonBeatsToBarBeat(
      landed.startBeats,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  const landedLength = landed.endBeats - landed.startBeats;

  if (
    region.lengthBeats != null &&
    differsAtPublishedResolution(
      region.lengthBeats,
      landedLength,
      roundBeats,
      true,
    )
  ) {
    shown.length = abletonBeatsToDuration(
      Math.max(landedLength, 0),
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  noteClipReadBack(reasons, clip.id, shown);
}
