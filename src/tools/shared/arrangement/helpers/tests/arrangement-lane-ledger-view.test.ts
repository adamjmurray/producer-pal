// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Ledgers over one lane view: each reports only what its own writes did, and
// none of them reads a lane another has already read.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { suspendWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { LaneLedger } from "../arrangement-lane-ledger.ts";
import { LaneView } from "../arrangement-lane-view.ts";

const MAIN: ArrangementLane = { kind: "track", trackIndex: 0 };

interface Span {
  id: string;
  start: number;
  end: number;
}

const clipMocks = new Map<string, RegisteredMockObject>();

/**
 * Put these clips on the track's main lane, replacing whatever was there.
 * @param spans - The clips, in Live's order
 */
function setMainLane(spans: Span[]): void {
  for (const [index, { id, start, end }] of spans.entries()) {
    clipMocks.set(
      id,
      registerMockObject(id, {
        path: livePath.track(0).arrangementClip(index),
        type: "Clip",
        properties: { start_time: start, end_time: end },
      }),
    );
  }

  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
}

/**
 * @param id - A clip's id
 * @returns Whether its span has been read since the registry was last set
 */
function wasRead(id: string): boolean {
  return (clipMocks.get(id)?.get.mock.calls.length ?? 0) > 0;
}

describe("ledgers that share a lane view", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
    clipMocks.clear();
  });

  it("reports only what each ledger's own write did", () => {
    setMainLane([
      { id: "a", start: 0, end: 8 },
      { id: "b", start: 16, end: 24 },
    ]);

    const lanes = new LaneView();
    const first = new LaneLedger({ lanes });

    first.scan(MAIN);
    setMainLane([
      { id: "new1", start: 0, end: 8 },
      { id: "b", start: 16, end: 24 },
    ]);

    expect(first.afterWrite(MAIN, ["new1"])).toBe(
      "overwrote the clip at t0[1|1]",
    );

    // A second ledger starts from the lane as the first left it.
    const second = new LaneLedger({ lanes });

    second.scan(MAIN);
    setMainLane([
      { id: "new1", start: 0, end: 8 },
      { id: "new2", start: 16, end: 24 },
    ]);

    expect(second.afterWrite(MAIN, ["new2"])).toBe(
      "overwrote the clip at t0[5|1]",
    );
    // The first heard of the second's write too, as it is a change to its lane.
    expect(first.afterWrite(MAIN, [])).toBe("overwrote the clip at t0[5|1]");
  });

  it("starts a ledger from a lane another has read without reading it again", () => {
    setMainLane([{ id: "a", start: 0, end: 8 }]);

    const lanes = new LaneView();

    new LaneLedger({ lanes }).scan(MAIN);
    clipMocks.get("a")?.get.mockClear();
    new LaneLedger({ lanes }).scan(MAIN);

    expect(wasRead("a")).toBe(false);
  });

  it("lets a ledger forget a lane for every ledger over the view", () => {
    setMainLane([{ id: "a", start: 0, end: 8 }]);

    const lanes = new LaneView();
    const first = new LaneLedger({ lanes });

    first.scan(MAIN);
    first.forget(MAIN);
    clipMocks.get("a")?.get.mockClear();
    new LaneLedger({ lanes }).scan(MAIN);

    expect(wasRead("a")).toBe(true);
  });

  describe("across a real wait", () => {
    it("still reports a write that was waiting on one against how the lane stood before it", async () => {
      setMainLane([{ id: "a", start: 0, end: 8 }]);

      const ledger = new LaneLedger({ lanes: new LaneView() });

      ledger.scan(MAIN);
      setMainLane([{ id: "new", start: 0, end: 8 }]);
      await suspendWarningCapture(Promise.resolve());

      expect(ledger.afterWrite(MAIN, ["new"])).toBe(
        "overwrote the clip at t0[1|1]",
      );
    });

    it("measures the next write against the lane as it is after the wait", async () => {
      setMainLane([{ id: "a", start: 0, end: 8 }]);

      const ledger = new LaneLedger({ lanes: new LaneView() });

      ledger.scan(MAIN);
      // Another request cut the lane while this one was parked.
      await suspendWarningCapture(Promise.resolve());
      setMainLane([{ id: "other", start: 0, end: 8 }]);
      ledger.scan(MAIN);
      setMainLane([
        { id: "other", start: 0, end: 4 },
        { id: "new", start: 4, end: 8 },
      ]);

      // It says what this write did to the other request's clip, and nothing
      // about the clip that request replaced.
      expect(ledger.afterWrite(MAIN, ["new"])).toBe(
        "shortened the clip at t0[1|1]",
      );
    });
  });

  it("leaves the entry's detail alone when the write displaced nothing", () => {
    setMainLane([{ id: "a", start: 0, end: 8 }]);

    const entry = new LaneLedger({ lanes: new LaneView() }).writeClip(
      { trackIndex: 0, takeLane: null },
      null,
      () => {
        setMainLane([
          { id: "a", start: 0, end: 8 },
          { id: "new", start: 16, end: 24 },
        ]);

        return { id: "new", detail: "first" };
      },
    );

    expect(entry).toStrictEqual({ id: "new", detail: "first" });
  });
});
