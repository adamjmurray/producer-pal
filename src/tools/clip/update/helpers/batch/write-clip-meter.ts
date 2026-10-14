// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { keptTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  getTimeSignature,
  type TimeSignature,
} from "../clip-beat-positions.ts";
import {
  type ClipReasons,
  noteClipReadBack,
  noteLanded,
} from "../entries/clip-reasons.ts";

/**
 * Write the clip's meter first, when the call sets one, and read it back: every
 * position the rest of the update reads or writes is in the meter the clip
 * ends up with, which is not the one asked for if Live changed it.
 * @param clip - The clip
 * @param timeSignature - The time signature the call sets, if any
 * @param reasons - What each clip has to say, added to
 * @returns The meter the clip has now
 */
export function writeClipMeter(
  clip: LiveAPI,
  timeSignature: string | undefined,
  reasons: ClipReasons,
): TimeSignature {
  const asked = getTimeSignature(timeSignature, clip);

  if (timeSignature == null) {
    return asked;
  }

  clip.setAll({
    signature_numerator: asked.timeSigNumerator,
    signature_denominator: asked.timeSigDenominator,
  });
  noteLanded(reasons, "time signature", { id: clip.id });

  const numerator = clip.getProperty("signature_numerator");
  const denominator = clip.getProperty("signature_denominator");
  const kept = keptTimeSignature(
    {
      numerator: asked.timeSigNumerator,
      denominator: asked.timeSigDenominator,
    },
    numerator,
    denominator,
  );

  if (kept == null) {
    return asked;
  }

  noteClipReadBack(reasons, clip.id, { timeSignature: kept });

  return {
    timeSigNumerator: numerator as number,
    timeSigDenominator: denominator as number,
  };
}
