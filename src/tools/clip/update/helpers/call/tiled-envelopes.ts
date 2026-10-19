// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { EPSILON } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { takeLaneIndexOfClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type ClipCall } from "./parse-clip-call.ts";
import { type ClipPayload } from "./resolve-clip-targets.ts";

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
  const looping =
    call.args.looping ?? (clip.getProperty("looping") as number) > 0;

  if (
    onTakeLane ||
    !looping ||
    lengthBeats <= span.end - span.start + EPSILON
  ) {
    return null;
  }

  return (
    "not updated: arrangementLength tiles this looped clip into new clips, " +
    "and envelopes would reach only the first. Send arrangementLength on its " +
    "own, then envelopes in a separate call on the clips it returns"
  );
}
