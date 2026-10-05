// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { suspendWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import {
  clipLane,
  LaneView,
  laneViewOf,
  sharingLaneView,
  trackLane,
} from "../arrangement-lane-view.ts";
import {
  clearReads,
  LANE_AFTER_WRITE,
  LANE_BEFORE_WRITE,
  MAIN,
  readOf,
  resetLaneMocks,
  setMainLane,
  setTakeLane,
  TAKE,
  type Span,
} from "./lane-view-fixtures.ts";

const TAKE_PATH = "live_set tracks 0 take_lanes 1 arrangement_clips 0";

const ABC: Span[] = [
  { id: "a", start: 0, end: 8 },
  { id: "b", start: 8, end: 16 },
  { id: "c", start: 24, end: 40 },
];

/**
 * @param aEnd - Where "a" ends
 * @param bStart - Where "b" starts
 * @returns Two near clips and one far from them, on the main lane
 */
function aBFar(aEnd: number, bStart = 20): Span[] {
  return [
    { id: "a", start: 0, end: aEnd },
    { id: "b", start: bStart, end: 30 },
    { id: "far", start: 100, end: 108 },
  ];
}

describe("LaneView", () => {
  beforeEach(() => {
    resetLaneMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("asking", () => {
    beforeEach(() => {
      setMainLane(ABC);
    });

    it("lists the clips in Live's order", () => {
      expect(new LaneView().clips(MAIN)).toStrictEqual(ABC);
    });

    it("finds the clips that share time with a stretch, not those at its edge", () => {
      const view = new LaneView();

      expect(view.overlapping(MAIN, 8, 24).map(({ id }) => id)).toStrictEqual([
        "b",
      ]);
      expect(view.overlapping(MAIN, 4, 30).map(({ id }) => id)).toStrictEqual([
        "a",
        "b",
        "c",
      ]);
      expect(view.overlapping(MAIN, 16, 24)).toStrictEqual([]);
    });

    it("finds the clip covering a position, with a start winning over an end", () => {
      const view = new LaneView();

      expect(view.covering(MAIN, 4)?.id).toBe("a");
      expect(view.covering(MAIN, 8)?.id).toBe("b");
      expect(view.covering(MAIN, 30)?.id).toBe("c");
      expect(view.covering(MAIN, 20)).toBeUndefined();
      expect(view.covering(MAIN, 40)).toBeUndefined();
    });

    it("finds where the last clip ends, and 0 for an empty lane", () => {
      expect(new LaneView().lastEnd(MAIN)).toBe(40);

      setMainLane([]);

      expect(new LaneView().lastEnd(MAIN)).toBe(0);
    });

    it("reads each clip once however often it is asked", () => {
      const view = new LaneView();

      view.clips(MAIN);
      clearReads();
      view.clips(MAIN);
      view.overlapping(MAIN, 0, 100);
      view.covering(MAIN, 1);
      view.lastEnd(MAIN);

      expect(readOf(["a", "b", "c"])).toStrictEqual([]);
    });

    it("reads the lane's ids on every question", () => {
      const view = new LaneView();

      view.clips(MAIN);

      const list = vi.spyOn(LiveAPI.prototype, "getChildIds");

      view.clips(MAIN);
      view.lastEnd(MAIN);

      expect(list).toHaveBeenCalledTimes(2);
    });
  });

  describe("clips that come and go", () => {
    it("drops a clip whose id has gone, and reads nothing", () => {
      const trackMock = setMainLane(ABC.slice(0, 2));

      const view = new LaneView();

      view.clips(MAIN);
      clearReads();
      trackMock.properties.arrangement_clips = children("a");

      expect(view.clips(MAIN).map(({ id }) => id)).toStrictEqual(["a"]);
      expect(readOf(["a", "b"])).toStrictEqual([]);
    });

    it("reads a new clip, and the clips it overlaps, and no others", () => {
      setMainLane(LANE_BEFORE_WRITE);

      const view = new LaneView();

      view.clips(MAIN);
      setMainLane(LANE_AFTER_WRITE);
      clearReads();

      expect(view.clips(MAIN).map(({ id, end }) => [id, end])).toStrictEqual([
        ["before", 8],
        ["hit", 12],
        ["new", 24],
        ["next", 32],
        ["far", 108],
      ]);
      expect(readOf(["before", "hit", "new", "next", "far"])).toStrictEqual([
        "hit",
        "new",
      ]);
    });
  });

  describe("writes that leave no clip", () => {
    beforeEach(() => {
      setMainLane(aBFar(20));
    });

    it("reads again the clips a reported stretch overlaps, and no others", () => {
      const view = new LaneView();

      view.clips(MAIN);
      // A temp clip trimmed a's tail and was deleted.
      setMainLane(aBFar(12));
      view.wrote(MAIN, { start: 12, end: 20 });
      clearReads();

      expect(view.clips(MAIN)[0]).toStrictEqual({ id: "a", start: 0, end: 12 });
      expect(readOf(["a", "b", "far"])).toStrictEqual(["a"]);
    });

    it("lets wroteOnTrack name a track instead of a lane", () => {
      const view = new LaneView();

      view.clips(MAIN);
      setMainLane(aBFar(12));
      view.wroteOnTrack(LiveAPI.from(livePath.track(0)), 12, 20);

      expect(view.clips(MAIN)[0]?.end).toBe(12);
    });

    it("is not told of a lane it hasn't read, which reads everything fresh", () => {
      const view = new LaneView();

      view.wrote(MAIN, { start: 0, end: 4 });
      view.changed(MAIN, ["a"]);

      expect(view.clips(MAIN)).toHaveLength(3);
    });

    it("reads a clip again that was said to have changed, and what it grew over", () => {
      const view = new LaneView();

      view.clips(MAIN);
      // a grew to 28 and b lost its front.
      setMainLane(aBFar(28, 28));
      view.changed(MAIN, ["a"]);
      clearReads();

      expect(view.clips(MAIN).map(({ id, end }) => [id, end])).toStrictEqual([
        ["a", 28],
        ["b", 30],
        ["far", 108],
      ]);
      expect(readOf(["a", "b", "far"])).toStrictEqual(["a", "b"]);
    });

    it("takes a clip's id however it is spelled", () => {
      const view = new LaneView();

      view.clips(MAIN);
      setMainLane(aBFar(4));
      view.changed(MAIN, ["id a"]);

      expect(view.clips(MAIN)[0]?.end).toBe(4);
    });

    it("reads a clip said to have changed once, however often it was said", () => {
      const view = new LaneView();

      view.clips(MAIN);
      view.changed(MAIN, ["a", "a"]);
      clearReads();
      view.clips(MAIN);
      clearReads();
      view.clips(MAIN);

      expect(readOf(["a"])).toStrictEqual([]);
    });
  });

  describe("take lanes", () => {
    it("leaves a take-lane clip the track's list shows out, and never checks it again", () => {
      setMainLane([
        { id: "a", start: 0, end: 8 },
        { id: "taken", start: 0, end: 8, path: TAKE_PATH },
      ]);

      const view = new LaneView();

      expect(view.clips(MAIN).map(({ id }) => id)).toStrictEqual(["a"]);

      const from = vi.spyOn(LiveAPI, "from");

      view.clips(MAIN);

      expect(
        from.mock.calls.filter(([id]) => String(id).startsWith("id ")),
      ).toStrictEqual([]);
    });

    it("keeps a lane's clips apart from the track's", () => {
      setMainLane([{ id: "m", start: 0, end: 8 }]);
      setTakeLane([{ id: "t", start: 4, end: 12 }]);

      const view = new LaneView();

      expect(view.clips(MAIN).map(({ id }) => id)).toStrictEqual(["m"]);
      expect(view.clips(TAKE).map(({ id }) => id)).toStrictEqual(["t"]);
    });
  });

  describe("forgetting", () => {
    beforeEach(() => {
      setMainLane([{ id: "a", start: 0, end: 8 }]);
      setTakeLane([{ id: "t", start: 0, end: 8 }]);
    });

    it("reads a forgotten lane again, and only that lane", () => {
      const view = new LaneView();

      view.clips(MAIN);
      view.clips(TAKE);
      view.forget(MAIN);
      clearReads();
      view.clips(MAIN);
      view.clips(TAKE);

      expect(readOf(["a", "t"])).toStrictEqual(["a"]);
    });

    it("reads every lane again after forgetAll, and says it did", () => {
      const view = new LaneView();

      view.clips(MAIN);
      view.clips(TAKE);

      const before = view.generation;

      view.forgetAll();
      clearReads();
      view.clips(MAIN);
      view.clips(TAKE);

      expect(readOf(["a", "t"])).toStrictEqual(["a", "t"]);
      expect(view.generation).toBe(before + 1);
    });

    it("forgets everything once any request has parked on a real wait", async () => {
      const view = new LaneView();

      view.clips(MAIN);
      clearReads();
      view.clips(MAIN);

      expect(readOf(["a"])).toStrictEqual([]);

      const before = view.generation;

      // Another request may have edited the lane while this one was parked.
      await suspendWarningCapture(Promise.resolve());
      view.clips(MAIN);

      expect(readOf(["a"])).toStrictEqual(["a"]);
      expect(view.generation).toBe(before + 1);

      // Only the wait: a later question keeps what it has just read.
      clearReads();
      view.clips(MAIN);

      expect(readOf(["a"])).toStrictEqual([]);
    });
  });

  describe("sharing", () => {
    it("hands a context's own view to whatever asks", () => {
      const view = new LaneView();

      expect(laneViewOf({ lanes: view })).toBe(view);
    });

    it("hands a helper with no view one of its own each time", () => {
      const context = {};

      expect(laneViewOf(context)).not.toBe(laneViewOf(context));
    });

    it("puts a view on the context for the length of a call, and takes it off", async () => {
      const context: { lanes?: LaneView } = {};
      let during: LaneView | undefined;

      await sharingLaneView(context, () => {
        during = context.lanes;

        return Promise.resolve();
      });

      expect(during).toBeInstanceOf(LaneView);
      expect("lanes" in context).toBe(false);
    });

    it("takes it off when the call throws", async () => {
      const context: { lanes?: LaneView } = {};

      await expect(
        sharingLaneView(context, () => Promise.reject(new Error("no"))),
      ).rejects.toThrow("no");
      expect("lanes" in context).toBe(false);
    });

    it("leaves a call nested in another to share the outer call's view", async () => {
      const context: { lanes?: LaneView } = {};
      const seen: Array<LaneView | undefined> = [];

      await sharingLaneView(context, async () => {
        seen.push(context.lanes);
        await sharingLaneView(context, () => {
          seen.push(context.lanes);

          return Promise.resolve();
        });
        seen.push(context.lanes);
      });

      expect(seen[0]).toBeInstanceOf(LaneView);
      expect(seen[1]).toBe(seen[0]);
      expect(seen[2]).toBe(seen[0]);
      expect("lanes" in context).toBe(false);
    });

    it("hands back what the call returns", async () => {
      expect(await sharingLaneView({}, () => Promise.resolve("done"))).toBe(
        "done",
      );
    });
  });

  describe("naming lanes", () => {
    it("names a track's main lane", () => {
      setMainLane([]);

      expect(trackLane(LiveAPI.from(livePath.track(3)))).toStrictEqual({
        kind: "track",
        trackIndex: 3,
      });
    });

    it("names a track with no index as -1", () => {
      expect(
        trackLane({ trackIndex: null } as unknown as LiveAPI),
      ).toStrictEqual({ kind: "track", trackIndex: -1 });
    });

    it("names the lane an arrangement clip sits on", () => {
      const clip = (path: string, trackIndex: number | null): LiveAPI =>
        ({ path, trackIndex }) as unknown as LiveAPI;

      expect(
        clipLane(clip("live_set tracks 2 arrangement_clips 4", 2)),
      ).toStrictEqual(MAIN_OF_TRACK_2);
      expect(clipLane(clip(TAKE_PATH, 0))).toStrictEqual(TAKE);
      expect(
        clipLane(clip("live_set tracks 2 clip_slots 1 clip", 2)),
      ).toBeNull();
      expect(clipLane(clip("", null))).toBeNull();
    });

    it("tells the view a clip is about to change, wherever it is", () => {
      setMainLane([
        { id: "a", start: 0, end: 20 },
        { id: "b", start: 20, end: 30 },
      ]);

      const view = new LaneView();

      view.clips(MAIN);
      setMainLane([
        { id: "a", start: 0, end: 25 },
        { id: "b", start: 25, end: 30 },
      ]);
      view.clipChanged(LiveAPI.from("id a"));
      // A session clip has no lane to tell.
      view.clipChanged({
        path: "live_set tracks 0 clip_slots 0 clip",
      } as LiveAPI);

      expect(view.clips(MAIN).map(({ id, end }) => [id, end])).toStrictEqual([
        ["a", 25],
        ["b", 30],
      ]);
    });
  });
});

const MAIN_OF_TRACK_2: ArrangementLane = { kind: "track", trackIndex: 2 };
