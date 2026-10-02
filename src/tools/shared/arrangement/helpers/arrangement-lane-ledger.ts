// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What is on each arrangement lane a call writes to, so a write can say what it
// overwrote without scanning the lane again.
//
// A write over a range never changes a clip that didn't overlap it. Live keeps
// a trimmed clip's id, except that a write starting exactly where a clip starts
// re-creates its rest under a new id. A split keeps the head on the id and gives
// the tail a new one; a covered clip's id is gone. So after a write the
// ledger reads the lane's id list, the written clips' spans, and the spans of
// cached clips that overlapped the written range. Nothing else can have moved.
//
// Only valid while every change to the lane since the scan went through the
// ledger. A caller that edits clips in other ways in between (shortening,
// splitting, resizing) must scan right before its tracked write instead.
//
// Holds ids and spans only, never a LiveAPI: objects are released when a
// request ends, and a ledger belongs to one call.

import {
  fromLiveApiId,
  toLiveApiId,
} from "#src/tools/shared/helpers/live-api-values.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { laneObject } from "./arrangement-clip-at-position.ts";
import { EPSILON } from "./arrangement-tiling-clips.ts";
import {
  arrangementLaneOf,
  type ClipSpan,
  describeWriteEffects,
} from "./arrangement-write-effects.ts";
import { type ArrangementTrack, isTakeLaneClip } from "./take-lanes.ts";

/** One lane as the ledger last saw it. */
interface LaneState {
  clips: Map<string, ClipSpan>;
  /** Clips the track's list showed that sit on a take lane, never re-checked. */
  notOnLane: Set<string>;
}

/** A stretch of the timeline. */
interface Reach {
  start: number;
  end: number;
}

/** The arrangement lanes one call has written to, and what was on them. */
export class LaneLedger {
  /** Every clip this call created or wrote, on any lane. */
  readonly ours = new Set<string>();
  private readonly lanes = new Map<string, LaneState>();

  /**
   * Read a lane's clips, the first time it is touched. Call before the write.
   * @param lane - The lane about to be written to
   * @param api - The lane object, when the caller already has it
   */
  scan(lane: ArrangementLane, api: LiveAPI = laneObject(lane)): void {
    this.stateOf(lane, api);
  }

  /**
   * Run a write that makes one clip, and say on that clip's entry what it did
   * to the clips already on the lane. The lane is read first, and dropped if
   * the write throws, since it may have changed unseen.
   * @param destination - The track and lane written to, or null when nothing
   *   arrangement-side is (a session create), which just runs the write
   * @param api - The lane object, when the caller already has it
   * @param write - Makes the clip, in its final shape, and returns its entry
   * @returns The entry, with what the write displaced added to its detail
   */
  writeClip<T extends { id: string; detail?: string }>(
    destination: ArrangementTrack | null,
    api: LiveAPI | null | undefined,
    write: () => T,
  ): T {
    if (destination == null) {
      return write();
    }

    const lane = arrangementLaneOf(destination);

    this.scan(lane, api ?? undefined);

    let entry: T;

    try {
      entry = write();
    } catch (error) {
      this.forget(lane);
      throw error;
    }

    const displaced = this.afterWrite(lane, [entry.id], api ?? undefined);

    if (displaced != null) {
      appendDetail(entry, displaced);
    }

    return entry;
  }

  /**
   * Drop what the ledger knows of a lane, for a failure that may have changed
   * it unseen. The next touch scans it again.
   * @param lane - The lane to forget
   */
  forget(lane: ArrangementLane): void {
    this.lanes.delete(laneKey(lane));
  }

  /**
   * What a write did to the clips already on the lane, in prose for the written
   * clip's own entry. Call once the written clips are in their final shape.
   * @param lane - The lane that was written to
   * @param written - Ids this write created or moved, which describe themselves
   * @param api - The lane object, when the caller already has it
   * @param reach - Everything the write may have cleared, when that can be
   *   wider than the clips it left
   * @returns The effects, joined with "; ", or undefined when there were none
   */
  afterWrite(
    lane: ArrangementLane,
    written: readonly string[],
    api: LiveAPI = laneObject(lane),
    reach?: Reach,
  ): string | undefined {
    const wrote = new Set(written.map(fromLiveApiId));
    const state = this.stateOf(lane, api);
    const ids = api.getChildIds("arrangement_clips").map(fromLiveApiId);
    const present = new Set(ids);
    const before = [...state.clips.values()]
      .filter((clip) => !wrote.has(clip.id))
      .toSorted((a, b) => a.start - b.start);
    // Spans read this time, and the new clips the write didn't make.
    const read = new Map<string, ClipSpan>();
    const tails: ClipSpan[] = [];

    for (const id of wrote) {
      this.ours.add(id);
    }

    for (const id of ids) {
      if (wrote.has(id)) {
        read.set(id, spanOf(id));
      } else if (!state.clips.has(id) && !state.notOnLane.has(id)) {
        const span = readNewClip(lane, state, id);

        if (span != null) {
          read.set(id, span);
          tails.push(span);
        }
      }
    }

    const touched = mergeReach(reach, [...read.values()]);

    for (const was of state.clips.values()) {
      if (
        touched != null &&
        present.has(was.id) &&
        !read.has(was.id) &&
        overlaps(was, touched)
      ) {
        read.set(was.id, spanOf(was.id));
      }
    }

    for (const id of state.clips.keys()) {
      if (!present.has(id)) {
        state.clips.delete(id);
      }
    }

    for (const [id, span] of read) {
      state.clips.set(id, span);
    }

    return describeWriteEffects(lane, before, state.clips, tails);
  }

  private stateOf(lane: ArrangementLane, api: LiveAPI): LaneState {
    const key = laneKey(lane);
    const known = this.lanes.get(key);

    if (known != null) {
      return known;
    }

    const state: LaneState = { clips: new Map(), notOnLane: new Set() };

    for (const id of api.getChildIds("arrangement_clips")) {
      const span = readNewClip(lane, state, fromLiveApiId(id));

      if (span != null) {
        state.clips.set(span.id, span);
      }
    }

    this.lanes.set(key, state);

    return state;
  }
}

// --- Helpers below main exports ---

/**
 * @param lane - An arrangement lane
 * @returns A key naming the lane
 */
function laneKey(lane: ArrangementLane): string {
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
 * The span of a clip the ledger hasn't seen. A track's own list is meant to
 * leave out take-lane clips, but isn't trusted to: one that turns up is
 * remembered so it is never checked or read again.
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
 * The stretch a write covered: the clips it left, and anything it cleared.
 * @param reach - What the caller says it cleared, if anything
 * @param spans - The spans of the clips the write left
 * @returns The stretch, or null when there is none
 */
function mergeReach(
  reach: Reach | undefined,
  spans: readonly ClipSpan[],
): Reach | null {
  const all = reach == null ? spans : [...spans, reach];

  return all.length === 0
    ? null
    : {
        start: Math.min(...all.map((span) => span.start)),
        end: Math.max(...all.map((span) => span.end)),
      };
}

/**
 * @param clip - A clip's span
 * @param reach - A stretch of the timeline
 * @returns Whether they share any time; touching at an edge doesn't count
 */
function overlaps(clip: ClipSpan, reach: Reach): boolean {
  return clip.start < reach.end - EPSILON && clip.end > reach.start + EPSILON;
}
