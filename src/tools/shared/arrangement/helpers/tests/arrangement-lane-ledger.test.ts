// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { LaneLedger } from "../arrangement-lane-ledger.ts";

const MAIN: ArrangementLane = { kind: "track", trackIndex: 0 };
const TAKE: ArrangementLane = {
  kind: "take-lane",
  trackIndex: 0,
  laneIndex: 1,
};

/** One clip on a lane, as the registry should answer for it. */
interface Span {
  id: string;
  start: number;
  end: number;
  /** The path to register it at; defaults to its place on the main lane. */
  path?: string;
}

const clipMocks = new Map<string, RegisteredMockObject>();

/**
 * Put these clips on the track's main lane, replacing whatever was there.
 * @param spans - The clips, in Live's order
 */
function setMainLane(spans: Span[]): void {
  setClips(spans, (index) => livePath.track(0).arrangementClip(index));
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
}

/**
 * Put these clips on take lane 1, replacing whatever was there. The track's own
 * list is empty.
 * @param spans - The clips, in Live's order
 */
function setTakeLane(spans: Span[]): void {
  setClips(spans, (index) =>
    livePath.track(0).takeLane(1).arrangementClip(index),
  );
  registerMockObject("lane_1", {
    path: livePath.track(0).takeLane(1),
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
}

/**
 * Register each clip, in place when it already exists.
 * @param spans - The clips, in Live's order
 * @param pathAt - The path a clip at that index sits on
 */
function setClips(spans: Span[], pathAt: (index: number) => string): void {
  for (const [index, { id, start, end, path }] of spans.entries()) {
    clipMocks.set(
      id,
      registerMockObject(id, {
        path: path ?? pathAt(index),
        type: "Clip",
        properties: { start_time: start, end_time: end },
      }),
    );
  }
}

/**
 * Forget every read so far, so a test sees only what a step cost.
 */
function clearReads(): void {
  for (const mock of clipMocks.values()) {
    mock.get.mockClear();
  }
}

/**
 * @param from - The spy on LiveAPI.from
 * @param since - How many calls to skip
 * @returns The clips looked up by id since then, sorted
 */
function clipsBuilt(
  from: { mock: { calls: unknown[][] } },
  since: number,
): string[] {
  return from.mock.calls
    .slice(since)
    .map(([id]) => String(id))
    .filter((id) => id.startsWith("id "))
    .toSorted();
}

/**
 * @param id - A clip's id
 * @returns Whether its span was read since the last {@link clearReads}
 */
function wasRead(id: string): boolean {
  return (clipMocks.get(id)?.get.mock.calls.length ?? 0) > 0;
}

/**
 * Scan the main lane, rewrite it, and report what the write did.
 * @param before - The clips on the lane to start with
 * @param after - The clips on it once the write has run
 * @param written - Ids the write itself made or moved
 * @returns What the write did to the clips that were already there
 */
function effectsOfWrite(
  before: Span[],
  after: Span[],
  written: string[] = [],
): string | undefined {
  setMainLane(before);

  const ledger = new LaneLedger();

  ledger.scan(MAIN);
  setMainLane(after);

  return ledger.afterWrite(MAIN, written);
}

describe("LaneLedger", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
    clipMocks.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says nothing when the write left the neighbours alone", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 0, end: 8 }],
        [
          { id: "a", start: 0, end: 8 },
          { id: "new", start: 16, end: 24 },
        ],
        ["new"],
      ),
    ).toBeUndefined();
  });

  it("names a clip the write covered, at the address it had", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 12, end: 20 }],
        [{ id: "new", start: 12, end: 24 }],
        ["new"],
      ),
    ).toBe("overwrote the clip at t0[4|1]");
  });

  it("names a clip the write cut short at its end", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 0, end: 20 }],
        [
          { id: "a", start: 0, end: 12 },
          { id: "new", start: 12, end: 24 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[1|1]");
  });

  // Live keeps the id when it trims the front of a clip.
  it("names a clip the write cut short at its front, at its new address", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 8, end: 24 }],
        [
          { id: "new", start: 0, end: 16 },
          { id: "a", start: 16, end: 24 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[5|1]");
  });

  // Live keeps the head on the original id and gives the tail a new one.
  it("names both pieces of a clip the write split", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 0, end: 32 }],
        [
          { id: "a", start: 0, end: 12 },
          { id: "new", start: 12, end: 16 },
          { id: "tail", start: 16, end: 32 },
        ],
        ["new"],
      ),
    ).toBe("split the clip at t0[1|1] into t0[1|1] and t0[5|1]");
  });

  it("joins what it did to several clips, in lane order", () => {
    expect(
      effectsOfWrite(
        [
          { id: "a", start: 0, end: 16 },
          { id: "b", start: 16, end: 24 },
        ],
        [
          { id: "a", start: 0, end: 8 },
          { id: "new", start: 8, end: 32 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[1|1]; overwrote the clip at t0[5|1]");
  });

  // A move's own source sits on the lane and is cleared right after.
  it("says nothing about the clips the write itself accounts for", () => {
    expect(
      effectsOfWrite(
        [{ id: "source", start: 0, end: 16 }],
        [{ id: "moved", start: 32, end: 48 }],
        ["source", "moved"],
      ),
    ).toBeUndefined();
  });

  it("reads the spans of the written clips and what they overlapped, no more", () => {
    setMainLane([
      { id: "before", start: 0, end: 8 },
      { id: "hit", start: 8, end: 24 },
      { id: "next", start: 24, end: 32 },
      { id: "far", start: 100, end: 108 },
    ]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    setMainLane([
      { id: "before", start: 0, end: 8 },
      { id: "hit", start: 8, end: 12 },
      { id: "new", start: 12, end: 24 },
      { id: "next", start: 24, end: 32 },
      { id: "far", start: 100, end: 108 },
    ]);
    clearReads();

    expect(ledger.afterWrite(MAIN, ["new"])).toBe(
      "shortened the clip at t0[3|1]",
    );
    expect(wasRead("new")).toBe(true);
    expect(wasRead("hit")).toBe(true);
    // Touching the written range at an edge isn't overlapping it.
    expect(wasRead("before")).toBe(false);
    expect(wasRead("next")).toBe(false);
    expect(wasRead("far")).toBe(false);
  });

  it("reads what a write may have cleared beyond the clips it left", () => {
    setMainLane([
      { id: "a", start: 0, end: 4 },
      { id: "b", start: 8, end: 20 },
    ]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    setMainLane([
      { id: "a", start: 0, end: 4 },
      { id: "b", start: 12, end: 20 },
    ]);
    clearReads();

    expect(
      ledger.afterWrite(MAIN, ["a"], { reach: { start: 0, end: 12 } }),
    ).toBe("shortened the clip at t0[4|1]");
  });

  // A move Live refuses after its landing was cleared leaves no clip to read.
  it("reads what a write cleared when it left no clip on the lane", () => {
    setMainLane([{ id: "n", start: 4, end: 12 }]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    setMainLane([{ id: "n", start: 8, end: 12 }]);

    expect(
      ledger.afterWrite(MAIN, ["ghost"], { reach: { start: 0, end: 8 } }),
    ).toBe("shortened the clip at t0[3|1]");
  });

  it("reports a clip an earlier write in the same call made", () => {
    setMainLane([{ id: "a", start: 0, end: 8 }]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    setMainLane([
      { id: "a", start: 0, end: 8 },
      { id: "first", start: 16, end: 24 },
    ]);

    expect(ledger.afterWrite(MAIN, ["first"])).toBeUndefined();

    setMainLane([
      { id: "a", start: 0, end: 8 },
      { id: "first", start: 16, end: 20 },
      { id: "second", start: 20, end: 32 },
    ]);

    expect(ledger.afterWrite(MAIN, ["second"])).toBe(
      "shortened the clip at t0[5|1]",
    );
    expect([...ledger.ours]).toStrictEqual(["first", "second"]);
  });

  it("reports a clip an earlier write made that a later one covers", () => {
    setMainLane([]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    setMainLane([{ id: "first", start: 16, end: 24 }]);
    ledger.afterWrite(MAIN, ["first"]);
    setMainLane([{ id: "second", start: 16, end: 32 }]);

    expect(ledger.afterWrite(MAIN, ["second"])).toBe(
      "overwrote the clip at t0[5|1]",
    );
  });

  it("scans a lane once", () => {
    setMainLane([{ id: "a", start: 0, end: 8 }]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    clearReads();
    ledger.scan(MAIN);

    expect(wasRead("a")).toBe(false);
  });

  it("scans again after forgetting a lane", () => {
    setMainLane([{ id: "a", start: 0, end: 8 }]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    ledger.forget(MAIN);
    clearReads();
    ledger.scan(MAIN);

    expect(wasRead("a")).toBe(true);
  });

  it("checks for a take-lane clip only on clips it hasn't seen", () => {
    setMainLane([
      { id: "a", start: 0, end: 8 },
      {
        id: "taken",
        start: 0,
        end: 8,
        path: "live_set tracks 0 take_lanes 1 arrangement_clips 0",
      },
    ]);

    const from = vi.spyOn(LiveAPI, "from");
    const ledger = new LaneLedger();
    const laneApi = LiveAPI.from(livePath.track(0));

    ledger.scan(MAIN, laneApi);

    const builtAtScan = from.mock.calls.length;

    expect(clipsBuilt(from, 0)).toStrictEqual(["id a", "id taken"]);

    setMainLane([
      { id: "a", start: 0, end: 4 },
      { id: "new", start: 4, end: 8 },
      {
        id: "taken",
        start: 0,
        end: 8,
        path: "live_set tracks 0 take_lanes 1 arrangement_clips 0",
      },
    ]);
    ledger.afterWrite(MAIN, ["new"], { api: laneApi });

    const built = clipsBuilt(from, builtAtScan);

    // The written clip, and the clip the write overlapped. Neither the cached
    // clip nor the take-lane clip already ruled out is looked up again.
    expect(built).toStrictEqual(["id a", "id new"]);
  });

  it("leaves a take-lane clip the track's list shows out of its reports", () => {
    setMainLane([
      {
        id: "taken",
        start: 0,
        end: 8,
        path: "live_set tracks 0 take_lanes 1 arrangement_clips 0",
      },
    ]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    setMainLane([
      {
        id: "taken",
        start: 0,
        end: 8,
        path: "live_set tracks 0 take_lanes 1 arrangement_clips 0",
      },
      { id: "new", start: 0, end: 8 },
    ]);

    expect(ledger.afterWrite(MAIN, ["new"])).toBeUndefined();
  });

  it("reads a take lane rather than the track's own clips", () => {
    setTakeLane([{ id: "a", start: 16, end: 24 }]);

    const ledger = new LaneLedger();

    ledger.scan(TAKE);
    setTakeLane([{ id: "new", start: 16, end: 32 }]);

    expect(ledger.afterWrite(TAKE, ["new"])).toBe(
      "overwrote the clip at t0/l1[5|1]",
    );
  });

  it("keeps the lanes it has seen apart", () => {
    setMainLane([{ id: "m", start: 0, end: 8 }]);
    setTakeLane([{ id: "t", start: 0, end: 8 }]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    ledger.scan(TAKE);
    setTakeLane([{ id: "new", start: 0, end: 8 }]);

    expect(ledger.afterWrite(TAKE, ["new"])).toBe(
      "overwrote the clip at t0/l1[1|1]",
    );

    clearReads();
    setMainLane([
      { id: "m", start: 0, end: 8 },
      { id: "other", start: 16, end: 24 },
    ]);

    expect(ledger.afterWrite(MAIN, ["other"])).toBeUndefined();
    expect([...ledger.ours]).toStrictEqual(["new", "other"]);
  });

  describe("writeClip", () => {
    it("just runs a write that isn't to the arrangement", () => {
      expect(
        new LaneLedger().writeClip(null, null, () => ({ id: "s" })),
      ).toStrictEqual({ id: "s" });
    });

    it("adds what the write displaced to the entry's detail", () => {
      setMainLane([{ id: "a", start: 12, end: 20 }]);

      const entry = new LaneLedger().writeClip(
        { trackIndex: 0, takeLane: null },
        null,
        () => {
          setMainLane([{ id: "new", start: 12, end: 24 }]);

          return { id: "new", detail: "first" };
        },
      );

      expect(entry.detail).toBe("first; overwrote the clip at t0[4|1]");
    });

    it("scans the lane again after a write that threw", () => {
      setMainLane([{ id: "a", start: 12, end: 20 }]);

      const ledger = new LaneLedger();
      const destination = { trackIndex: 0, takeLane: null };

      expect(() =>
        ledger.writeClip(destination, null, () => {
          throw new Error("no clip");
        }),
      ).toThrow("no clip");

      clearReads();
      ledger.scan(MAIN);

      expect(wasRead("a")).toBe(true);
    });

    it("scans the lane again after a read-back that threw", () => {
      setMainLane([{ id: "a", start: 12, end: 20 }]);

      const ledger = new LaneLedger();

      vi.spyOn(ledger, "afterWrite").mockImplementationOnce(() => {
        throw new Error("read failed");
      });

      expect(() =>
        ledger.writeClip({ trackIndex: 0, takeLane: null }, null, () => ({
          id: "new",
        })),
      ).toThrow("read failed");

      clearReads();
      ledger.scan(MAIN);

      expect(wasRead("a")).toBe(true);
    });
  });

  it("scans every lane again after forgetAll", () => {
    setMainLane([{ id: "a", start: 12, end: 20 }]);

    const ledger = new LaneLedger();

    ledger.scan(MAIN);
    ledger.forgetAll();
    clearReads();
    ledger.scan(MAIN);

    expect(wasRead("a")).toBe(true);
  });
});
