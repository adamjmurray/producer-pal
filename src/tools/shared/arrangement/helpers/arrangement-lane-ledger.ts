// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What each arrangement write did to the clips already on its lane, in prose.
//
// The lane's contents come from a LaneView, which keeps them true across the
// whole call. The ledger keeps its own note of how each lane stood before a
// write (its baseline), so what it reports is what the write changed, not what
// the call changed. Every write that goes through the ledger must be reported
// to it (afterWrite) before the next one starts.
//
// A call whose own clips report their own fate (duplicate: a copy a later copy
// buries says so on its own entry) can ask the ledger to leave those clips out
// of what a later write reports. A clip counts as the call's own only if it was
// written by the call, or is what Live left of one: a copy's split-off tail, or
// the rest of a copy re-created under a new id. A new clip anywhere else is
// never assumed to be ours.

import { fromLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { EPSILON } from "./arrangement-tiling-clips.ts";
import {
  laneKey,
  laneObject,
  LaneView,
  type Reach,
} from "./arrangement-lane-view.ts";
import {
  arrangementLaneOf,
  type ClipSpan,
  describeWriteEffects,
} from "./arrangement-write-effects.ts";
import { type ArrangementTrack } from "./take-lanes.ts";

/** What {@link LaneLedger.afterWrite} may be told besides the written ids. */
interface AfterWriteOptions {
  api?: LiveAPI;
  reach?: Reach;
}

/** How the ledger reports, and what it reads the lanes from. */
interface LedgerOptions {
  /** Leave the call's own clips out of what a write reports. */
  skipOwn?: boolean;
  /** The call's lanes; a ledger of its own when the caller has none. */
  lanes?: LaneView;
}

/** The arrangement lanes one call has written to, and what was on them. */
export class LaneLedger {
  /**
   * Every clip this call created or wrote, on any lane. With `skipOwn`, also
   * what Live left of one of them when a later write cut it.
   */
  readonly ours = new Set<string>();
  readonly lanes: LaneView;
  /** Each lane as it stood after the last write the ledger heard of. */
  private baselines = new Map<string, Map<string, ClipSpan>>();
  private baselinesOf: number;
  private readonly skipOwn: boolean;

  /**
   * @param options - How to report
   * @param options.skipOwn - Leave the call's own clips out of what a write
   *   reports, because their own entries say what became of them
   * @param options.lanes - The call's lanes, shared with everything else that
   *   writes to them
   */
  constructor(options: LedgerOptions = {}) {
    this.skipOwn = options.skipOwn === true;
    this.lanes = options.lanes ?? new LaneView();
    this.baselinesOf = this.lanes.generation;
  }

  /**
   * Note how a lane stands, the first time it is touched. Call before the
   * write.
   * @param lane - The lane about to be written to
   * @param api - The lane object, when the caller already has it
   */
  scan(lane: ArrangementLane, api: LiveAPI = laneObject(lane)): void {
    // A write ahead may have been parked on a wait that let another request
    // edit lanes, which leaves every note about how a lane stood no good. One
    // already in flight keeps its own: it is what the write is measured against.
    if (this.baselinesOf !== this.lanes.generation) {
      this.baselines.clear();
      this.baselinesOf = this.lanes.generation;
    }

    this.baselineOf(lane, api);
  }

  /**
   * Run a write that makes one clip, and say on that clip's entry what it did
   * to the clips already on the lane. The lane is read first, and dropped if
   * the write or the read-back throws, since it may have changed unseen.
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

    const laneApi = api ?? undefined;

    this.scan(lane, laneApi);

    let entry: T;
    let displaced: string | undefined;

    try {
      entry = write();
      displaced = this.afterWrite(lane, [entry.id], { api: laneApi });
    } catch (error) {
      this.forget(lane);
      throw error;
    }

    if (displaced != null) {
      appendDetail(entry, displaced);
    }

    return entry;
  }

  /**
   * Drop what the ledger knows of a lane, for a failure that may have changed
   * it unseen. The next touch reads it again.
   * @param lane - The lane to forget
   */
  forget(lane: ArrangementLane): void {
    this.baselines.delete(laneKey(lane));
    this.lanes.forget(lane);
  }

  /**
   * Drop every lane, after an await: another request may have edited any of
   * them meanwhile.
   */
  forgetAll(): void {
    this.lanes.forgetAll();
    this.baselines.clear();
    this.baselinesOf = this.lanes.generation;
  }

  /**
   * What a write did to the clips already on the lane, in prose for the written
   * clip's own entry. Call once the written clips are in their final shape.
   * @param lane - The lane that was written to
   * @param written - Ids this write created or moved, which describe themselves
   * @param options - Optional extras
   * @param options.api - The lane object, when the caller already has it
   * @param options.reach - Everything the write may have cleared, when that
   *   can be wider than the clips it left (or it left none)
   * @returns The effects, joined with "; ", or undefined when there were none
   */
  afterWrite(
    lane: ArrangementLane,
    written: readonly string[],
    { api = laneObject(lane), reach }: AfterWriteOptions = {},
  ): string | undefined {
    const wrote = new Set(written.map(fromLiveApiId));
    const baseline = this.baselineOf(lane, api);

    if (reach != null) {
      this.lanes.wrote(lane, reach);
    }

    this.lanes.changed(lane, wrote);

    const now = this.lanes.clips(lane, api);
    const after = new Map(now.map((clip) => [clip.id, clip]));
    const before = [...baseline.values()]
      .filter((clip) => !wrote.has(clip.id))
      .toSorted((a, b) => a.start - b.start);
    const reported = this.skipOwn
      ? before.filter((clip) => !this.ours.has(clip.id))
      : before;
    // The clips the write made that it didn't name: what it cut off a clip.
    const tails = now.filter(
      (clip) => !baseline.has(clip.id) && !wrote.has(clip.id),
    );

    for (const id of wrote) {
      this.ours.add(id);
    }

    if (this.skipOwn) {
      this.claimTailsOfOwn(before, tails);
    }

    this.baselines.set(laneKey(lane), after);

    return describeWriteEffects(lane, reported, after, tails);
  }

  /**
   * Live gives the cut-off part of a clip a new id. When the clip was ours, so
   * is the part.
   * @param before - The clips the write didn't make, as they were
   * @param tails - New clips the write didn't make
   */
  private claimTailsOfOwn(
    before: readonly ClipSpan[],
    tails: readonly ClipSpan[],
  ): void {
    for (const tail of tails) {
      const cutFromOwn = before.some(
        (clip) =>
          this.ours.has(clip.id) &&
          tail.start > clip.start + EPSILON &&
          tail.start < clip.end - EPSILON,
      );

      if (cutFromOwn) {
        this.ours.add(tail.id);
      }
    }
  }

  /**
   * How the lane stood after the last write, noted from the view the first
   * time.
   * @param lane - The lane
   * @param api - The lane object
   * @returns Its clips by id
   */
  private baselineOf(
    lane: ArrangementLane,
    api: LiveAPI,
  ): Map<string, ClipSpan> {
    const key = laneKey(lane);
    const known = this.baselines.get(key);

    if (known != null) {
      return known;
    }

    const noted = new Map(
      this.lanes.clips(lane, api).map((clip) => [clip.id, clip]),
    );

    this.baselines.set(key, noted);

    return noted;
  }
}
