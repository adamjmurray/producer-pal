// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { takeLaneIndexOfClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type ClipCall } from "./parse-clip-call.ts";
import { type ClipPayload } from "./resolve-clip-targets.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/**
 * Why a target's envelopes can't go with its arrangementLength. Lengthening a
 * looped arrangement clip tiles it into new clips, and envelopes would reach
 * only the first. An unlooped clip grows in place, and a shorten makes no
 * tiles, so both are fine.
 * @param payload - The target's payload
 * @param call - The update-clip call
 * @returns The refusal, or null when the envelopes can go
 */
export function tiledEnvelopesRefusal(
  payload: ClipPayload,
  call: ClipCall,
): string | null {
  const { clip, destination, lengthBeats, span } = payload;

  if (call.envelopeLines == null || lengthBeats == null || span == null) {
    return null;
  }

  // update-clip never tiles on a take lane.
  const onTakeLane =
    destination == null
      ? takeLaneIndexOfClip(clip) != null
      : destination.kind === "take-lane";
  // Unwarping an audio clip turns its looping off, unless the call loops it.
  const unwarps =
    call.args.warping === false &&
    (clip.getProperty("is_audio_clip") as number) > 0;
  const looping =
    call.args.looping ??
    (!unwarps && (clip.getProperty("looping") as number) > 0);

  if (
    onTakeLane ||
    !looping ||
    lengthBeats <= span.end - span.start + SAME_TIME_EPSILON
  ) {
    return null;
  }

  return (
    "not updated: arrangementLength tiles this looped clip into new clips, " +
    "and envelopes would reach only the first. Send arrangementLength on its " +
    "own, then envelopes in a separate call on the clips it returns"
  );
}
