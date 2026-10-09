// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A clip re-created on a take lane, or promoted onto a main lane, says what it
// overwrote on its own entry, and not on the lane's.

import { describe, expect, it, vi } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerLiveLane } from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";
import {
  CLIPS_ONLY,
  duplicateToLanes,
  type LaneCopyEntry,
  registerArrangementSource,
  registerLaneSource,
  registerLiveSet,
  registerMainLaneSource,
  registerTakeLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

// Take lane copies warn about what re-creating costs.
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  deleted?: true;
  detail?: string;
}

const OLD = { id: "old", start: 0, end: 4 };

describe("a track copied onto a take lane", () => {
  it("says on the clip what it overwrote, not on the lane", async () => {
    registerMainLaneSource([0]);
    registerLiveLane({ trackIndex: 1, laneIndex: 0, clips: [OLD] });

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: "src_track",
      toPath: "t1/l0",
    });

    expect(result.clips).toStrictEqual([
      {
        id: "copy-1-0",
        path: "t1/l0[1|1]",
        detail: "overwrote the clip at t1/l0[1|1]",
      },
    ]);
    expect(result.detail).toBe(CLIPS_ONLY);
  });

  it("says nothing for a clip that landed on a clear lane", async () => {
    registerMainLaneSource([0]);
    registerLiveLane({ trackIndex: 1, laneIndex: 0 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: "src_track",
      toPath: "t1/l0",
    });

    expect(result.clips).toStrictEqual([
      { id: "copy-1-0", path: "t1/l0[1|1]" },
    ]);
  });

  // The second destination is the same lane. It covers the first copy whole,
  // so that one is never written and the second overwrote the clip that was there.
  it("leaves a copy a later copy of the call buries unwritten", async () => {
    registerMainLaneSource([0]);
    registerLiveLane({ trackIndex: 1, laneIndex: 0, clips: [OLD] });

    const result = await duplicateToLanes<LaneCopyEntry[]>({
      id: "src_track",
      toPath: "t1/l0,t1/l0",
    });

    expect(result[0]).toStrictEqual({
      path: "t1/l0",
      detail: "overwritten later in this call by t1/l0[1|1]",
    });
    expect(result[1]?.clips).toStrictEqual([
      {
        id: "copy-1-0",
        path: "t1/l0[1|1]",
        detail: "overwrote the clip at t1/l0[1|1]",
      },
    ]);
  });

  it("says what a clip that was refused had already cleared, with no ok: false", async () => {
    registerMainLaneSource([0]);

    const lane = registerLiveLane({
      trackIndex: 1,
      laneIndex: 0,
      clips: [OLD],
    });

    lane.declineNextWrite();

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: "src_track",
      toPath: "t1/l0",
    });

    expect(result.clips).toStrictEqual([
      {
        path: "t1/l0[1|1]",
        detail:
          "the take-lane copy failed: Live created no clip at t1/l0[1|1]; " +
          "overwrote the clip at t1/l0[1|1]",
      },
    ]);
  });

  it("reads the lane once, however many clips it copies", async () => {
    const existing = Array.from({ length: 30 }, (_, i) => ({
      id: `old-${i}`,
      start: 1000 + i * 8,
      end: 1004 + i * 8,
    }));

    const readsAfterCopying = async (
      starts: number[],
      trackIndex: number,
    ): Promise<number[]> => {
      registerMainLaneSource(starts);

      const lane = registerLiveLane({
        trackIndex,
        laneIndex: 0,
        clips: existing.map((clip) => ({
          ...clip,
          id: `${clip.id}-t${trackIndex}`,
        })),
      });
      const there = lane.clips().map((clip) => clip.id);

      await duplicateToLanes({
        id: "src_track",
        toPath: `t${trackIndex}/l0`,
      });

      return there.map((id) => lane.mocks.get(id)?.get.mock.calls.length ?? 0);
    };

    const one = await readsAfterCopying([0], 1);
    const five = await readsAfterCopying([0, 16, 32, 48, 64], 2);

    expect(one.every((reads) => reads > 0)).toBe(true);
    expect(five).toStrictEqual(one);
  });
});

describe("a take lane promoted onto a main lane", () => {
  it("says on the clip what it overwrote", async () => {
    registerLaneSource([0]);
    registerLiveLane({ trackIndex: 1, clips: [OLD] });

    const result = await duplicateToLanes<LaneCopyEntry>({
      path: "t0/l0",
      toPath: "t1",
    });

    expect(result.clips).toStrictEqual([
      {
        id: "copy-1-0",
        path: "t1[1|1]",
        detail: "overwrote the clip at t1[1|1]",
      },
    ]);
  });
});

describe("a clip copied onto a take lane or a main lane", () => {
  it("says on the copy what it overwrote on a take lane", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    registerLiveLane({ trackIndex: 1, laneIndex: 0, clips: [OLD] });

    const result = (await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t1/l0[1|1]",
    })) as Entry;

    expect(result.path).toBe("t1/l0[1|1]");
    expect(result.detail).toContain("re-created on the take lane");
    expect(result.detail).toContain("overwrote the clip at t1/l0[1|1]");
  });

  it("says on the copy what it overwrote when promoted", async () => {
    registerLiveSet();
    registerTakeLaneSource();
    registerLiveLane({ trackIndex: 1, clips: [OLD] });

    const result = (await duplicate({
      type: "clip",
      id: "tl_src_clip",
      toPath: "t1[1|1]",
    })) as Entry;

    expect(result.detail).toContain("promoted to the main lane");
    expect(result.detail).toContain("overwrote the clip at t1[1|1]");
  });

  it("answers a copy refused after clearing as landed, saying what it cleared", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const lane = registerLiveLane({
      trackIndex: 1,
      laneIndex: 0,
      clips: [OLD],
    });

    lane.declineNextWrite();

    // The landing changed the Set, so a lone refused copy isn't an error.
    const result = await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t1/l0[1|1]",
    });

    expect(result).toStrictEqual({
      path: "t1/l0[1|1]",
      detail:
        "the take-lane copy failed: Live created no clip at t1/l0[1|1]; " +
        "overwrote the clip at t1/l0[1|1]",
    });
  });
});
