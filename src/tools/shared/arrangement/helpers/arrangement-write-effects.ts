// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a write to the arrangement did to the clips that were already there.
// Live overwrites, trims and splits them to make room and reports none of it,
// so the lane is photographed before the write and compared after.

import { joinReasons } from "#src/tools/shared/helpers/entry-reasons.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { arrangementPositionPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { clipsOnLane, laneObject } from "./arrangement-clip-at-position.ts";
import { EPSILON } from "./arrangement-tiling-clips.ts";
import { type ArrangementTrack } from "./take-lanes.ts";

/** The clips on one lane, as they were before a write. */
export interface LaneSnapshot {
  lane: ArrangementLane;
  /** The lane object, kept so the read-back doesn't resolve it again. */
  api: LiveAPI;
  clips: ClipSpan[];
}

/** Where one clip began and ended. */
interface ClipSpan {
  id: string;
  start: number;
  end: number;
}

/**
 * The lane a move's destination names, as a path coordinate.
 * @param target - The track and take lane the clip lands on
 * @returns The lane
 */
export function arrangementLaneOf(target: ArrangementTrack): ArrangementLane {
  const { trackIndex, takeLane } = target;

  return takeLane == null
    ? { kind: "track", trackIndex }
    : { kind: "take-lane", trackIndex, laneIndex: takeLane };
}

/**
 * Photograph a lane before a write, so what the write did to it can be read
 * back afterwards. Costs a scan of the lane plus two reads per clip on it.
 * @param lane - The lane about to be written to
 * @param api - The lane object, when the caller already has it
 * @returns The clips and their spans
 */
export function snapshotLane(
  lane: ArrangementLane,
  api: LiveAPI = laneObject(lane),
): LaneSnapshot {
  return { lane, api, clips: scanLane(lane, api) };
}

/**
 * What the write did to the clips that were already on the lane, in prose for
 * the written clip's own entry.
 * @param before - The lane as {@link snapshotLane} found it
 * @param written - Ids this write created or moved, which describe themselves
 * @returns The effects, joined with "; ", or undefined when there were none
 */
export function arrangementWriteEffects(
  before: LaneSnapshot,
  written: readonly string[],
): string | undefined {
  const ours = new Set(written);
  const wasThere = new Set(before.clips.map((clip) => clip.id));
  const after = scanLane(before.lane, before.api);
  const nowById = new Map(after.map((clip) => [clip.id, clip]));
  // A new id inside an old span is what Live kept of that clip: the tail of a
  // split, or the rest of a front trim.
  const strangers = after.filter(
    (clip) => !ours.has(clip.id) && !wasThere.has(clip.id),
  );

  return joinReasons(
    before.clips
      .filter((was) => !ours.has(was.id))
      .map((was) =>
        effectOnClip(before.lane, was, nowById.get(was.id), strangers),
      ),
  );
}

// --- Helpers below main exports ---

/**
 * The clips on a lane with their spans.
 * @param lane - The lane to scan
 * @param laneApi - The lane object
 * @returns Each clip, in Live's order
 */
function scanLane(lane: ArrangementLane, laneApi: LiveAPI): ClipSpan[] {
  return clipsOnLane(lane, laneApi).map((api) => ({
    id: api.id,
    start: api.getProperty("start_time") as number,
    end: api.getProperty("end_time") as number,
  }));
}

/**
 * What the write did to one clip that was already there.
 * @param lane - The lane it sat on
 * @param was - Its span before the write
 * @param now - Its span after, or undefined when it is gone
 * @param strangers - Clips on the lane that neither the write nor the snapshot
 *   accounts for
 * @returns The effect, or undefined when the write left it alone
 */
function effectOnClip(
  lane: ArrangementLane,
  was: ClipSpan,
  now: ClipSpan | undefined,
  strangers: readonly ClipSpan[],
): string | undefined {
  const wasAt = arrangementPositionPath(lane, was.start);
  const inside = strangers.filter(
    (clip) =>
      clip.start > was.start + EPSILON && clip.start < was.end - EPSILON,
  );

  if (now == null) {
    // Live re-creates what a front trim leaves under a new id, ending where
    // the old clip did.
    const rest = inside.find((clip) => Math.abs(clip.end - was.end) <= EPSILON);

    return rest == null
      ? `overwrote the clip at ${wasAt}`
      : `shortened the clip at ${arrangementPositionPath(lane, rest.start)}`;
  }

  const tail = inside[0];

  if (tail != null) {
    return `split the clip at ${wasAt} into ${arrangementPositionPath(lane, now.start)} and ${arrangementPositionPath(lane, tail.start)}`;
  }

  if (
    Math.abs(now.start - was.start) > EPSILON ||
    Math.abs(now.end - was.end) > EPSILON
  ) {
    return `shortened the clip at ${arrangementPositionPath(lane, now.start)}`;
  }

  return undefined;
}
