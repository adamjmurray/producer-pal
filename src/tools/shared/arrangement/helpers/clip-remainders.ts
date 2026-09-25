// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding what is left of a clip another clip landed across the front of. Live
// re-creates the rest under a new id, so the old id can't find it. The rest
// ends where the clip did, which is what identifies it.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { clipsOnLane } from "./arrangement-clip-at-position.ts";

/** What is left of a landing once later ones trimmed its front. */
export interface TrimmedLanding {
  lane: ArrangementLane;
  /** The earliest beat the remainder can start at. */
  beats: number;
  /** Where the landing ends, which the trim leaves alone. */
  end: number;
}

/** A clip on a scanned lane, with its span read once. */
interface ScannedClip {
  api: LiveAPI;
  start: number;
  end: number;
}

/**
 * Looks a trimmed landing's remainder up, scanning each lane (and reading each
 * clip's span) at most once. A clip whose id is in `taken` belongs to
 * something else and is passed over.
 * @returns A look-up that answers with the remainder, or null when it is gone
 */
export function remainderFinder(): (
  trim: TrimmedLanding,
  taken?: ReadonlySet<string>,
) => LiveAPI | null {
  const scanned = new Map<string, ScannedClip[]>();

  return (trim, taken) => {
    const key = JSON.stringify(trim.lane);
    const clips = scanned.get(key) ?? scanClips(trim.lane);

    scanned.set(key, clips);

    return (
      clips.find((clip) => !taken?.has(clip.api.id) && isRemainder(clip, trim))
        ?.api ?? null
    );
  };
}

/**
 * The clips on a lane with their spans.
 * @param lane - The lane to scan
 * @returns Each clip, in Live's order
 */
function scanClips(lane: ArrangementLane): ScannedClip[] {
  return clipsOnLane(lane).map((api) => ({
    api,
    start: api.getProperty("start_time") as number,
    end: api.getProperty("end_time") as number,
  }));
}

/**
 * Whether a clip is what a trim left: it ends where the landing did, and
 * starts no earlier than the trim could have left it. A landing trimmed again
 * from the front by some other clip is still itself, and still ends there.
 * @param clip - A clip on the landing's lane
 * @param trim - What the trim left behind
 * @returns True when this is the remainder
 */
function isRemainder(clip: ScannedClip, trim: TrimmedLanding): boolean {
  return (
    Math.abs(clip.end - trim.end) < SAME_TIME_EPSILON &&
    clip.start > trim.beats - SAME_TIME_EPSILON
  );
}
