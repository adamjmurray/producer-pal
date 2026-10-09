// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What is on each arrangement lane a call touches, read once and kept true as
// the call writes. Every arrangement write path asks this instead of scanning
// the lane itself: one scan costs a LiveAPI per clip, and a call that asks per
// copy or per clip pays that many times over.
//
// A write over a range never changes a clip that didn't overlap it. Live keeps
// a trimmed clip's id, except that a write starting exactly where a clip starts
// re-creates its rest under a new id. A split keeps the head on the id and gives
// the tail a new one; a covered clip's id is gone. So every question starts with
// one read of the lane's id list, which shows clips that came or went. A clip
// that stayed can only have changed span if a write over it said so, and only
// those are read again.
//
// A writer says so with {@link LaneView.wrote} (a stretch it may have cut into:
// a temp clip made and deleted to trim, a resize) or {@link LaneView.changed}
// (a clip whose own span it edited). A write that leaves a new clip behind needs
// neither: the new id is found, and its span counts as written. A caller that
// can't say what it did drops the lane with {@link LaneView.forget}.
//
// Holds ids and spans only, never a LiveAPI: objects are released when a request
// ends. Belongs to one call, passed down on the tool context. It drops
// everything itself once any request has parked on a real wait, because another
// one may have edited lanes meanwhile.

import { suspensionCount } from "#src/shared/max/v8-warning-capture.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  fromLiveApiId,
  toLiveApiId,
} from "#src/tools/shared/helpers/live-api-values.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { EPSILON } from "./arrangement-tiling-clips.ts";
import { type ClipSpan } from "./arrangement-write-effects.ts";
import { isTakeLaneClip, takeLaneIndexOfClip } from "./take-lanes.ts";

/** A stretch of the timeline. */
export interface Reach {
  start: number;
  end: number;
}

/** One lane as the view last saw it. */
interface LaneState {
  /** The ids on the lane, in Live's order. */
  order: string[];
  clips: Map<string, ClipSpan>;
  /** Clips the track's list showed that sit on a take lane, never re-checked. */
  notOnLane: Set<string>;
  /** Stretches writers have said they may have cut into since the last read. */
  reaches: Reach[];
  /** Clips whose own span a writer has said it edited. */
  changed: Set<string>;
}

/** The arrangement lanes one call has looked at, and what is on them. */
export class LaneView {
  private readonly lanes = new Map<string, LaneState>();
  private seenSuspensions = suspensionCount();
  private drops = 0;

  /**
   * Bumps each time every lane is dropped, whether the caller said so or a
   * wait did, so something that kept its own notes about the lanes (see
   * LaneLedger) knows they are no good.
   * @returns The count so far
   */
  get generation(): number {
    this.dropAfterWait();

    return this.drops;
  }

  /**
   * Every clip on the lane, in Live's order, as it is now.
   * @param lane - The lane
   * @param api - The lane object, when the caller already has it
   * @returns The clips and their spans
   */
  clips(lane: ArrangementLane, api?: LiveAPI): ClipSpan[] {
    const state = this.sync(lane, api);

    return state.order.map((id) => state.clips.get(id) as ClipSpan);
  }

  /**
   * The clips with any time in a stretch, in Live's order.
   * @param lane - The lane
   * @param start - Where the stretch begins, in beats
   * @param end - Where it ends, in beats
   * @param api - The lane object, when the caller already has it
   * @returns The clips; one that only touches an edge isn't in it
   */
  overlapping(
    lane: ArrangementLane,
    start: number,
    end: number,
    api?: LiveAPI,
  ): ClipSpan[] {
    return this.clips(lane, api).filter(
      (clip) => clip.start < end && clip.end > start,
    );
  }

  /**
   * The clip covering a position. A clip's end is exclusive, so a clip ending
   * exactly there loses to one starting there.
   * @param lane - The lane
   * @param beats - The position, in beats
   * @param api - The lane object, when the caller already has it
   * @returns The first clip that covers it, or undefined when none does
   */
  covering(
    lane: ArrangementLane,
    beats: number,
    api?: LiveAPI,
  ): ClipSpan | undefined {
    return this.clips(lane, api).find(
      (clip) =>
        startsAtBeats(clip.start, beats) ||
        insideBeats(clip.start, clip.end, beats),
    );
  }

  /**
   * Where the last clip on the lane ends.
   * @param lane - The lane
   * @param api - The lane object, when the caller already has it
   * @returns The furthest end, in beats; 0 for an empty lane
   */
  lastEnd(lane: ArrangementLane, api?: LiveAPI): number {
    return Math.max(0, ...this.clips(lane, api).map((clip) => clip.end));
  }

  /**
   * Say a write may have cut into clips in a stretch, without leaving a clip
   * there to show it (a temp clip made and deleted to trim, a resize). A lane
   * the view hasn't read yet needs no word: its first read sees everything.
   * @param lane - The lane written to
   * @param reach - The stretch the write covered
   */
  wrote(lane: ArrangementLane, reach: Reach): void {
    this.lanes.get(laneKey(lane))?.reaches.push(reach);
  }

  /**
   * {@link LaneView.wrote} for a write on a track's main lane.
   * @param track - The track written to
   * @param start - Where the write begins, in beats
   * @param end - Where it ends, in beats
   */
  wroteOnTrack(track: LiveAPI, start: number, end: number): void {
    this.wrote(trackLane(track), { start, end });
  }

  /**
   * Say clips' own spans may have changed: a property write that resizes one,
   * or a clip the call is about to edit. Wherever it grew to counts as written.
   * @param lane - The lane the clips are on
   * @param ids - The clips
   */
  changed(lane: ArrangementLane, ids: Iterable<string>): void {
    const state = this.lanes.get(laneKey(lane));

    for (const id of ids) {
      state?.changed.add(fromLiveApiId(id));
    }
  }

  /**
   * {@link LaneView.changed} for a clip that is about to be edited, wherever it
   * is. A session clip, or one the view has never read, needs nothing.
   * @param clip - The clip
   */
  clipChanged(clip: LiveAPI): void {
    const lane = clipLane(clip);

    if (lane != null) {
      this.changed(lane, [clip.id]);
    }
  }

  /**
   * Drop what the view knows of a lane, for a failure that may have changed it
   * unseen. The next question reads it again.
   * @param lane - The lane to forget
   */
  forget(lane: ArrangementLane): void {
    this.lanes.delete(laneKey(lane));
  }

  /** Drop every lane. */
  forgetAll(): void {
    this.lanes.clear();
    this.drops++;
  }

  /**
   * Bring a lane up to date: one read of its ids, then only the spans a clip
   * coming, going or written over could have changed.
   * @param lane - The lane
   * @param api - The lane object, when the caller already has it
   * @returns The lane's state
   */
  private sync(lane: ArrangementLane, api?: LiveAPI): LaneState {
    this.dropAfterWait();

    const ids = (api ?? laneObject(lane))
      .getChildIds("arrangement_clips")
      .map(fromLiveApiId);
    const known = this.lanes.get(laneKey(lane));

    if (known == null) {
      return this.scan(lane, ids);
    }

    this.reconcile(lane, known, ids);

    return known;
  }

  /** Drop every lane if any request has parked on a real wait since the last look. */
  private dropAfterWait(): void {
    if (suspensionCount() !== this.seenSuspensions) {
      this.seenSuspensions = suspensionCount();
      this.forgetAll();
    }
  }

  /**
   * Read a lane for the first time.
   * @param lane - The lane
   * @param ids - Its clips' ids
   * @returns The lane's state
   */
  private scan(lane: ArrangementLane, ids: string[]): LaneState {
    const state: LaneState = {
      order: [],
      clips: new Map(),
      notOnLane: new Set(),
      reaches: [],
      changed: new Set(),
    };

    for (const id of ids) {
      const span = readNewClip(lane, state, id);

      if (span != null) {
        state.clips.set(id, span);
        state.order.push(id);
      }
    }

    this.lanes.set(laneKey(lane), state);

    return state;
  }

  /**
   * Fold into a known lane what has happened since it was read: clips that
   * went, clips that came, clips whose span was edited, and the clips any of
   * those, or any stretch a writer reported, overlap.
   * @param lane - The lane
   * @param state - What the view knew
   * @param ids - The lane's clips' ids now
   */
  private reconcile(
    lane: ArrangementLane,
    state: LaneState,
    ids: string[],
  ): void {
    const present = new Set(ids);

    for (const id of state.clips.keys()) {
      if (!present.has(id)) {
        state.clips.delete(id);
      }
    }

    // Everything written over: what writers said, plus each clip that came or
    // was edited, wherever it is now.
    const reaches = [...state.reaches];
    const read = new Set<string>();

    for (const id of ids) {
      const span = readIfNew(lane, state, id) ?? readIfChanged(state, id);

      if (span != null) {
        state.clips.set(id, span);
        reaches.push(span);
        read.add(id);
      }
    }

    for (const [id, was] of state.clips) {
      if (!read.has(id) && reaches.some((reach) => overlaps(was, reach))) {
        state.clips.set(id, spanOf(id));
      }
    }

    state.order = ids.filter((id) => state.clips.has(id));
    state.reaches = [];
    state.changed.clear();
  }
}

/**
 * Run a tool call with a lane view on its context, so everything it hands the
 * context to — a helper, a spread copy, a tool nested in it — shares one. The
 * view is taken off again when the call that made it is done, since a context
 * can outlive a call (a test's shared one) and a view must not. A call nested
 * in another finds the view already there and leaves it to the outer call.
 * @param context - The context the call was given
 * @param run - The call
 * @returns What the call returns
 */
export async function sharingLaneView<T>(
  context: { lanes?: LaneView },
  run: () => Promise<T>,
): Promise<T> {
  if (context.lanes != null) {
    return await run();
  }

  context.lanes = new LaneView();

  try {
    return await run();
  } finally {
    delete context.lanes;
  }
}

/**
 * The view a helper reads lanes through. A context a call never made one for
 * has none to share, so the helper gets a view of its own: it reads each lane
 * fresh, the way every helper did before they shared one.
 * @param context - The context the helper was given
 * @returns The context's view, or a new one
 */
export function laneViewOf(context: { lanes?: LaneView }): LaneView {
  return context.lanes ?? new LaneView();
}

/**
 * @param start - Where a clip starts, in beats
 * @param beats - A position, in beats
 * @returns Whether the clip starts there, give or take Live's rounding
 */
export function startsAtBeats(start: number, beats: number): boolean {
  return Math.abs(start - beats) < SAME_TIME_EPSILON;
}

/**
 * @param start - Where a clip starts, in beats
 * @param end - Where it ends; the end is exclusive
 * @param beats - A position, in beats
 * @returns Whether the position is after the start and before the end
 */
export function insideBeats(
  start: number,
  end: number,
  beats: number,
): boolean {
  return start < beats && beats < end - SAME_TIME_EPSILON;
}

/**
 * The Track or TakeLane a lane coordinate names.
 * @param lane - The lane
 * @returns The object holding that lane's arrangement clips
 */
export function laneObject(lane: ArrangementLane): LiveAPI {
  return LiveAPI.from(
    lane.kind === "take-lane"
      ? livePath.track(lane.trackIndex).takeLane(lane.laneIndex)
      : livePath.track(lane.trackIndex),
  );
}

/**
 * The lane an arrangement clip sits on.
 * @param clip - Any clip
 * @returns Its lane, or null for a clip that isn't on one (a session clip)
 */
export function clipLane(clip: LiveAPI): ArrangementLane | null {
  const { trackIndex } = clip;

  if (trackIndex == null || !clip.path.includes(" arrangement_clips ")) {
    return null;
  }

  const laneIndex = takeLaneIndexOfClip(clip);

  return laneIndex == null
    ? { kind: "track", trackIndex }
    : { kind: "take-lane", trackIndex, laneIndex };
}

/**
 * A track's main lane.
 * @param track - The track
 * @returns The lane. A track with no index (never an arrangement track) is
 *   index -1.
 */
export function trackLane(track: LiveAPI): ArrangementLane {
  return { kind: "track", trackIndex: track.trackIndex ?? -1 };
}

// --- Helpers below main exports ---

/**
 * @param lane - An arrangement lane
 * @returns A key naming the lane
 */
export function laneKey(lane: ArrangementLane): string {
  return lane.kind === "take-lane"
    ? `${lane.trackIndex}/${lane.laneIndex}`
    : `${lane.trackIndex}`;
}

/**
 * A clip's span, read from Live.
 * @param id - The clip's id
 * @param clip - The clip's object, when the caller already built it
 * @returns Where it begins and ends
 */
function spanOf(
  id: string,
  clip: LiveAPI = LiveAPI.from(toLiveApiId(id)),
): ClipSpan {
  return {
    id,
    start: clip.getProperty("start_time") as number,
    end: clip.getProperty("end_time") as number,
  };
}

/**
 * The span of a clip the view hasn't seen. A track's own list is meant to leave
 * out take-lane clips, but isn't trusted to: one that turns up is remembered so
 * it is never checked or read again.
 * @param lane - The lane the clip was listed on
 * @param state - The lane's state, which learns the answer
 * @param id - The clip's id
 * @returns Its span, or null when it isn't on the lane
 */
function readNewClip(
  lane: ArrangementLane,
  state: LaneState,
  id: string,
): ClipSpan | null {
  const clip = LiveAPI.from(toLiveApiId(id));

  if (lane.kind === "track" && isTakeLaneClip(clip)) {
    state.notOnLane.add(id);

    return null;
  }

  return spanOf(id, clip);
}

/**
 * @param lane - The lane
 * @param state - The lane's state
 * @param id - A clip on the lane
 * @returns Its span when the view hasn't seen it, else null
 */
function readIfNew(
  lane: ArrangementLane,
  state: LaneState,
  id: string,
): ClipSpan | null {
  return state.clips.has(id) || state.notOnLane.has(id)
    ? null
    : readNewClip(lane, state, id);
}

/**
 * @param state - The lane's state
 * @param id - A clip on the lane
 * @returns Its span when a writer said it edited it, else null
 */
function readIfChanged(state: LaneState, id: string): ClipSpan | null {
  return state.changed.has(id) && state.clips.has(id) ? spanOf(id) : null;
}

/**
 * @param clip - A clip's span
 * @param reach - A stretch of the timeline
 * @returns Whether they share any time; touching at an edge doesn't count
 */
function overlaps(clip: ClipSpan, reach: Reach): boolean {
  return clip.start < reach.end - EPSILON && clip.end > reach.start + EPSILON;
}
