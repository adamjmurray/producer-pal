// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finding what is left of a clip another clip in the call landed across. Live
// re-creates the rest under a new id, so the old id can't find it, and later
// landings can cut the rest short or split it. A landing clears its whole span
// and pieces only shrink, so a piece of this clip lies inside the span it
// landed at and outside every span the call wrote after it.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { LaneView } from "./arrangement-lane-view.ts";
import { type ClipSpan } from "./arrangement-write-effects.ts";

/** Counts landings as they happen; only the order matters, never the value. */
let landings = 0;

/** Where a landing put its clip, and when. */
export interface LandedSpan {
  lane: ArrangementLane;
  /** Where the clip started as it landed, in beats. */
  start: number;
  /** Where it ended as it landed, in beats. */
  end: number;
  /** Higher landed later, from nextLandingOrder(). Not result order. */
  order: number;
  /** Set on a resize's span: the clip it resizes, which it never cuts short */
  resizes?: string;
}

/** What is left of a landed clip, and the path to report it by. */
export interface Remainder {
  clip: LiveAPI;
  path: string;
}

/** What claimRemainders() looks up, and what it has to steer clear of. */
export interface RemainderClaim<Entry> {
  /** The entries whose clip is gone from where they put it. */
  entries: Iterable<Entry>;
  /** Where an entry's clip landed, or undefined when that isn't known. */
  spanOf: (entry: Entry) => LandedSpan | undefined;
  /** Every span the call wrote: landings, gone or not, and anything else. */
  written: Iterable<LandedSpan>;
  /** Ids the call's other entries still name. */
  taken: Iterable<string>;
  /** The call's lanes, which know what is on each one without a scan. */
  lanes?: LaneView;
}

/**
 * The order of a landing that just happened, for LandedSpan.order.
 * @returns A number higher than any landing before it
 */
export function nextLandingOrder(): number {
  return landings++;
}

/**
 * A write whose span is unknown, taken as the whole lane: no landing before it
 * on that lane can claim anything.
 * @param lane - The lane it wrote to
 * @returns The span, ordered as landing now
 */
export function wholeLaneWrite(lane: ArrangementLane): LandedSpan {
  return { lane, start: -Infinity, end: Infinity, order: nextLandingOrder() };
}

/**
 * Finds what is left of each gone entry's clip: a clip inside the span it
 * landed at that no span written later touches, and that no other entry
 * names. Latest landed first, each clip claimed once. Asks the lane view for
 * each lane once, and looks up only the clips it hands back.
 * @param claim - The entries, where they landed, and what to steer clear of
 * @returns The piece each entry names, for each clip with any left
 */
export function claimRemainders<Entry>(
  claim: RemainderClaim<Entry>,
): Map<Entry, Remainder> {
  const claimed = new Set(claim.taken);
  const written = [...claim.written];
  const lanes = claim.lanes ?? new LaneView();
  const scanned = new Map<string, ClipSpan[]>();
  const found = new Map<Entry, Remainder>();
  const latestFirst = [...claim.entries]
    .flatMap((entry) => {
      const span = claim.spanOf(entry);

      return span == null ? [] : [{ entry, span }];
    })
    .toSorted((a, b) => b.span.order - a.span.order);

  for (const { entry, span } of latestFirst) {
    const key = JSON.stringify(span.lane);
    const clips = scanned.get(key) ?? lanes.clips(span.lane);

    scanned.set(key, clips);

    const later = written.filter(
      (other) => other.order > span.order && JSON.stringify(other.lane) === key,
    );
    const pieces = clips.filter(
      (clip) =>
        !claimed.has(clip.id) &&
        liesInside(clip, span) &&
        !later.some((other) => overlaps(clip, other)),
    );
    const named = namedPiece(pieces, span);
    const piece =
      named == null ? undefined : LiveAPI.from(toLiveApiId(named.id));
    const path = piece == null ? undefined : objectPathForApi(piece);

    if (piece != null && path != null) {
      claimed.add(piece.id);
      found.set(entry, { clip: piece, path });
    }
  }

  return found;
}

/**
 * Whether a clip lies wholly inside a landing's span.
 * @param clip - A clip on the landing's lane
 * @param span - Where the landing put its clip
 * @returns True when the clip could be a piece of it
 */
function liesInside(clip: ClipSpan, span: LandedSpan): boolean {
  return (
    clip.start > span.start - SAME_TIME_EPSILON &&
    clip.end < span.end + SAME_TIME_EPSILON
  );
}

/**
 * Whether a clip reaches into a landing's span.
 * @param clip - A clip on the landing's lane
 * @param span - Where the landing put its clip
 * @returns True when they share more than an edge
 */
function overlaps(clip: ClipSpan, span: LandedSpan): boolean {
  return (
    clip.start < span.end - SAME_TIME_EPSILON &&
    clip.end > span.start + SAME_TIME_EPSILON
  );
}

/**
 * The piece an entry names when its clip was cut: the one ending where it
 * landed, else the earliest — which is the one starting there, if any does.
 * @param pieces - The candidate clips
 * @param span - Where the landing put its clip
 * @returns The piece, or undefined when there is none
 */
function namedPiece(
  pieces: ClipSpan[],
  span: LandedSpan,
): ClipSpan | undefined {
  const earliestFirst = pieces.toSorted((a, b) => a.start - b.start);

  return (
    earliestFirst.find(
      (clip) => Math.abs(clip.end - span.end) < SAME_TIME_EPSILON,
    ) ?? earliestFirst[0]
  );
}
