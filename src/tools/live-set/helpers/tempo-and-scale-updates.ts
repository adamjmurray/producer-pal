// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type PublishedValue,
  differsAtPublishedResolution,
  publishedReadBack,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { overridesAutomation } from "#src/tools/shared/arrangement/tracks/automation-override.ts";
import { round2dp } from "#src/tools/shared/helpers/rounding.ts";
import { keptTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";

/**
 * Apply tempo to live set, with validation. Reported only when Live kept a
 * different tempo — an echo of the argument says nothing.
 * @param liveSet - The live_set object
 * @param tempo - Tempo in BPM
 * @param result - Result object to update
 * @param result.tempo - Tempo property to set
 * @returns True when the write overrode the tempo's arrangement automation
 */
export function applyTempo(
  liveSet: LiveAPI,
  tempo: number,
  result: { tempo?: PublishedValue },
): boolean {
  const songTempo = LiveAPI.from(livePath.masterTrack().mixerDevice()).child(
    "song_tempo",
  );
  const overrode = overridesAutomation(
    songTempo,
    () => {
      // Range already refused by validateTempo, before any property was written.
      liveSet.set("tempo", tempo);
    },
    () => liveSet.getProperty("tempo"),
  );

  const landed = publishedReadBack(liveSet.getProperty("tempo"), round2dp);

  if (landed != null && differsAtPublishedResolution(tempo, landed, round2dp)) {
    result.tempo = landed;
  }

  return overrode;
}

/**
 * Apply a time signature to the live set, reporting it only when Live kept a
 * different one.
 * @param liveSet - The live_set object
 * @param signature - The time signature as parsed from the argument
 * @param signature.numerator - Beats per bar
 * @param signature.denominator - The beat's note value
 * @param result - Result object to update
 * @param result.timeSignature - Time signature property to set
 */
export function applyTimeSignature(
  liveSet: LiveAPI,
  signature: { numerator: number; denominator: number },
  result: { timeSignature?: string },
): void {
  liveSet.set("signature_numerator", signature.numerator);
  liveSet.set("signature_denominator", signature.denominator);

  const kept = keptTimeSignature(
    signature,
    liveSet.getProperty("signature_numerator"),
    liveSet.getProperty("signature_denominator"),
  );

  if (kept != null) {
    result.timeSignature = kept;
  }
}
