// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// An earlier clip is only said to be overwritten or cut short when the later
// write that does it really landed, and it is written before a later clip that
// only covers part of it, so it can't land on top of that one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  copiedSources,
  setUpLane,
} from "../move-order/lane-with-clips-test-helpers.ts";

const NO_COPY =
  "not moved: Live made no copy at the destination, so the original was kept";

describe("a clip a later move was to go over", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The later clip still gets its name, so it isn't a skip, but nothing of the
  // move that was to replace the earlier clip happened.
  it("isn't overwritten when the later clip's move landed no copy, whatever else of it did", async () => {
    setUpLane(
      [
        { id: "100", start: 0, length: 16 },
        { id: "101", start: 100, length: 16 },
      ],
      ["101"],
    );

    const result = (await updateClip({
      id: "100,101",
      arrangementStart: "17|1",
      name: "Lost,Kept",
    })) as ClipResult[];

    expect(result).toStrictEqual([
      {
        id: "100",
        ok: false,
        detail: "not written: t0[17|1] was meant to replace it, but failed",
      },
      expect.objectContaining({ id: "101", detail: NO_COPY }),
    ]);
    expect(result[1]).not.toHaveProperty("ok");
  });

  it("isn't said to be cut short when the later clip's move landed no copy", async () => {
    setUpLane(
      [
        { id: "100", start: 0, length: 16 },
        { id: "101", start: 100, length: 8 },
      ],
      ["101"],
    );

    const result = (await updateClip({
      id: "100,101",
      arrangementStart: "17|1,17|1",
    })) as ClipResult[];

    expect(result[0]).not.toHaveProperty("detail");
  });

  it("isn't said to be cut short when its own move landed no copy", async () => {
    setUpLane(
      [
        { id: "100", start: 0, length: 16 },
        { id: "101", start: 100, length: 8 },
      ],
      ["100"],
    );

    const result = (await updateClip({
      id: "100,101",
      arrangementStart: "17|1,17|1",
      name: "A,B",
    })) as ClipResult[];

    expect(result[0]?.detail).toBe(NO_COPY);
  });

  it("fails every earlier mention of a clip when the one that was to replace them all failed", async () => {
    setUpLane(
      [
        { id: "100", start: 0, length: 16 },
        { id: "101", start: 100, length: 16 },
      ],
      ["101"],
    );

    const result = await updateClip({
      id: "100,100,101",
      arrangementStart: "17|1,17|1,17|1",
    });

    expect(result).toStrictEqual([
      {
        id: "100",
        ok: false,
        detail: "not written: id 100 was meant to replace it, but failed",
      },
      {
        id: "100",
        ok: false,
        detail: "not written: t0[17|1] was meant to replace it, but failed",
      },
      { id: "101", ok: false, detail: NO_COPY },
    ]);
  });
});

describe("a clip a later move goes over only part of", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A lands on beats 64-80 and B on 64-72, over A's front. A first waits for D
  // to move off its span; B has to wait for A, not slip in ahead of it.
  it("is written before that move, even when it has to wait for another clip to move away", async () => {
    const track = setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 20, length: 8 },
      { id: "102", start: 74, length: 4 },
    ]);

    const result = (await updateClip({
      id: "100,101,102",
      arrangementStart: "17|1,17|1,65|1",
    })) as ClipResult[];

    // Live trims A's copy with duplicates of its own copies; only the clips
    // the caller named show the order.
    expect(
      copiedSources(track).filter((source) => !source.startsWith("id copy")),
    ).toStrictEqual(["id 102", "id 100", "id 101"]);
    expect(result[0]?.detail).toBe("shortened by t0[17|1] later in this call");
  });
});

describe("a clip a later move goes over only part of, and has to wait for", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A lands on beats 64-80, over where C stands now (70-78). C lands on 60-68,
  // over A's front, so it has to come after A. A needs C gone first.
  it("refuses both moves like a cycle", async () => {
    const track = setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 70, length: 8 },
    ]);

    const result = await updateClip({
      id: "100,101",
      arrangementStart: "17|1,16|1",
    });

    expect(copiedSources(track)).toStrictEqual([]);
    expect(result).toStrictEqual([
      {
        id: "100",
        ok: false,
        detail:
          "not moved: it would land on clip t0[18|3] (id 101), which this call can't move out of the way first; move them in separate calls",
      },
      {
        id: "101",
        ok: false,
        // It is not landing on A: A is going over its old place, not the reverse.
        detail:
          "not moved: it lands over part of where clip t0[1|1] (id 100) is going, and this call can't write that clip first; move them in separate calls",
      },
    ]);
  });
});

describe("a clip left where it is while a later move lands on it", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says which write cleared it, drops its id, and the lander says what it destroyed", async () => {
    setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 20, length: 16 },
      { id: "102", start: 40, length: 16 },
    ]);

    // 100's move is covered by 101's, so it stays at bar 1 — where 102 lands.
    const result = await updateClip({
      id: "100,101,102",
      arrangementStart: "17|1,17|1,1|1",
    });

    expect(result).toStrictEqual([
      { detail: "overwritten later in this call by t0[1|1]" },
      expect.objectContaining({ id: "copy-1", path: "t0[17|1]" }),
      {
        id: "copy-2",
        path: "t0[1|1]",
        detail: "overwrote the clip at t0[1|1]",
      },
    ]);
  });
});
