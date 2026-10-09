// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createClipsForLength } from "../arrangement-length.ts";
import { type CopyEvent, type StampWorld } from "./stamp-world-test-helpers.ts";

/** What a copy's entry says when Live wrote the clip's automation to the lane. */
export const LANE_WRITE_NOTE =
  "wrote its automation to the track's arrangement lane over this span";

/**
 * Copy the world's source clip to track 0 at a length, as duplicate does.
 * @param world - The Set
 * @param lengthBeats - The arrangementLength, in beats
 * @param context - Overrides for the call's context
 * @returns The entries createClipsForLength gave
 */
export function copyAtLength(
  world: StampWorld,
  lengthBeats: number,
  context: Record<string, unknown> = {},
): ReturnType<typeof createClipsForLength> {
  const source = LiveAPI.from(world.source.path);
  const track = LiveAPI.from(livePath.track(0));

  return createClipsForLength(
    source,
    track,
    16,
    lengthBeats,
    4,
    4,
    undefined,
    { silenceWavPath: "/silence.wav", ...context },
    undefined,
  );
}

/**
 * What each stamp showed and where it went, as [from, to, at] where `at` is
 * beats into the copy.
 * @param stamps - The copies taken while the scratch clip had envelopes
 * @returns One triple per stamp
 */
export function shownByStamps(stamps: CopyEvent[]): number[][] {
  return stamps.map((stamp) => [
    stamp.looping ? stamp.loopStart : stamp.startMarker,
    stamp.loopEnd,
    stamp.at - 16,
  ]);
}
