// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What one call has written to the arrangement, span by span, in the order it
// happened. A clip that is no longer where its entry put it can only be
// accounted for by what was written after it landed: a later landing that cut
// it, or part of it, away.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import {
  type LandedSpan,
  nextLandingOrder,
  wholeLaneWrite,
} from "#src/tools/shared/arrangement/helpers/clip-remainders.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { arrangementPositionPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

/** The spans a call has written, and where each copy it landed landed. */
export interface LandingLog {
  /** Where and when each copy landed, by the id its entry reported. */
  landed: Map<string, LandedSpan>;
  /**
   * Every span written, whoever's clip it holds: the landings, a landing that
   * failed but may have cleared a range, and a resize's tiles and temp clips.
   */
  written: LandedSpan[];
}

/**
 * An empty log for one call.
 * @returns The log
 */
export function newLandingLog(): LandingLog {
  return { landed: new Map(), written: [] };
}

/**
 * Record that a clip's copy is confirmed to be sitting here. A duplicate Live
 * silently declined still cleared the range, so it counts as written but never
 * as a landing.
 * @param log - What the call has written, added to
 * @param landing - The track and lane the clip landed on
 * @param startBeats - The position it landed at, in beats
 * @param copy - The copy it landed, as it was before anything trimmed it
 * @param copy.id - The copy's id
 * @param copy.length - Its length as it landed, or null when unreadable
 */
export function recordLandedClip(
  log: LandingLog,
  landing: ArrangementTrack,
  startBeats: number,
  copy: { id: string; length: number | null },
): void {
  const lane = arrangementLaneOf(landing);

  if (copy.length == null) {
    log.written.push(wholeLaneWrite(lane));

    return;
  }

  const span = {
    lane,
    start: startBeats,
    end: startBeats + copy.length,
    order: nextLandingOrder(),
  };

  log.landed.set(copy.id, span);
  log.written.push(span);
}

/**
 * Record a placement that failed but may have left a clip behind, as a partial
 * re-create does. No entry names that clip, so no earlier landing may claim it.
 * @param log - What the call has written, added to
 * @param landing - The track and lane it was headed for
 * @param startBeats - The position it was headed for, in beats
 * @param length - The moved clip's length, or null when unreadable
 */
export function recordFailedLanding(
  log: LandingLog,
  landing: ArrangementTrack,
  startBeats: number,
  length: number | null,
): void {
  const lane = arrangementLaneOf(landing);

  log.written.push(
    length == null
      ? wholeLaneWrite(lane)
      : {
          lane,
          start: startBeats,
          end: startBeats + length,
          order: nextLandingOrder(),
        },
  );
}

/**
 * Record what a resize is about to write: between the clip's end and its new
 * end, where any tiles or temp clips go. Not the clip's own span, or a clip
 * resized to its own length and then front-cut could never claim its rest.
 * Call it just before the resize. It belongs to no entry's clip, so it only
 * keeps earlier landings from claiming a piece there.
 * @param log - What the call has written, added to
 * @param clip - The clip about to be resized
 * @param lengthBeats - The length it is resized to, in beats
 */
export function recordResize(
  log: LandingLog,
  clip: LiveAPI,
  lengthBeats: number,
): void {
  const { trackIndex } = clip;

  if (trackIndex == null) {
    return;
  }

  const lane = arrangementLaneOf({ trackIndex, takeLane: clip.takeLaneIndex });
  const start = clip.getProperty("start_time");
  const end = clip.getProperty("end_time");

  if (typeof start !== "number" || typeof end !== "number") {
    log.written.push({ ...wholeLaneWrite(lane), resizes: clip.id });

    return;
  }

  const newEnd = start + lengthBeats;

  log.written.push({
    lane,
    start: Math.min(end, newEnd),
    end: Math.max(end, newEnd),
    order: nextLandingOrder(),
    resizes: clip.id,
  });
}

/**
 * Who wrote over a span: the first write after it that reaches into it.
 * @param span - Where the clip sat, if known
 * @param written - Every span the call wrote
 * @returns The spot that write landed at ("t0[5|1]"), or undefined when no
 *   write can be named
 */
export function writtenOverBy(
  span: LandedSpan | undefined,
  written: readonly LandedSpan[],
): string | undefined {
  const over = writesOver(span, written)
    .filter((other) => Number.isFinite(other.start))
    .toSorted((a, b) => a.order - b.order)[0];

  return over == null
    ? undefined
    : arrangementPositionPath(over.lane, over.start);
}

/**
 * Whether any write after a span reaches into it, a write that can't be named
 * (a whole lane) included. A clip that ends sooner than it landed was cut by a
 * write of the call only if this is true.
 * @param span - Where the clip sat, if known
 * @param written - Every span the call wrote
 * @returns True when a later write overlapped it
 */
export function wroteOver(
  span: LandedSpan | undefined,
  written: readonly LandedSpan[],
): boolean {
  return writesOver(span, written).length > 0;
}

/**
 * The writes after a span that reach into it, on its lane.
 * @param span - Where the clip sat, if known
 * @param written - Every span the call wrote
 * @returns The overlapping later writes
 */
function writesOver(
  span: LandedSpan | undefined,
  written: readonly LandedSpan[],
): LandedSpan[] {
  const lane = JSON.stringify(span?.lane);

  return written.filter(
    (other) =>
      span != null &&
      other.order > span.order &&
      JSON.stringify(other.lane) === lane &&
      other.start < span.end - SAME_TIME_EPSILON &&
      other.end > span.start + SAME_TIME_EPSILON,
  );
}
