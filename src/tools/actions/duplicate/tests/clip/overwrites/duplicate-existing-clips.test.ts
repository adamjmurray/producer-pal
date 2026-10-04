// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What an arrangement copy says about the clips that were on its lane before
// the call: overwritten, shortened or split. A clip the call made itself says
// what became of it on its own entry.

import { describe, expect, it } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerEightBeatSource,
  registerLiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  deleted?: true;
  detail?: string;
}

/**
 * Copy the source to arrangement positions on track 1.
 * @param toPath - The destinations
 * @returns The result
 */
async function copyTo(toPath: string): Promise<Entry | Entry[]> {
  return (await duplicate({ type: "clip", id: "source", toPath })) as
    | Entry
    | Entry[];
}

/** A source, and a lane whose clip at beats 16-20 is cleared by a copy Live then declines. */
function registerDeclinedLane(): void {
  registerEightBeatSource();
  registerLiveLane({
    trackIndex: 1,
    clips: [{ id: "x", start: 16, end: 20 }],
  }).declineNextWrite();
}

describe("what a copy did to the clips already on its lane", () => {
  it("says it overwrote a clip it covered whole", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 16, end: 20 }],
    });

    expect(await copyTo("t1[5|1]")).toStrictEqual({
      id: "copy-1-0",
      path: "t1[5|1]",
      detail: "overwrote the clip at t1[5|1]",
    });
  });

  it("says it shortened a clip it covered the end of", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 0, end: 20 }],
    });

    expect(await copyTo("t1[5|1]")).toStrictEqual({
      id: "copy-1-0",
      path: "t1[5|1]",
      detail: "shortened the clip at t1[1|1]",
    });
  });

  // Live deletes a clip a write starts exactly on and re-creates the rest.
  it("says it shortened a clip it covered the front of", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 16, end: 40 }],
    });

    // What Live left of the clip took the lane's first new id.
    expect(await copyTo("t1[5|1]")).toStrictEqual({
      id: "copy-1-1",
      path: "t1[5|1]",
      detail: "shortened the clip at t1[7|1]",
    });
  });

  it("says it split a clip it landed inside", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 8, end: 40 }],
    });

    // The tail of the split took the lane's first new id.
    expect(await copyTo("t1[5|1]")).toStrictEqual({
      id: "copy-1-1",
      path: "t1[5|1]",
      detail: "split the clip at t1[3|1] into t1[3|1] and t1[7|1]",
    });
  });

  it("says nothing when a copy lands in free space", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 64, end: 68 }],
    });

    expect(await copyTo("t1[5|1]")).toStrictEqual({
      id: "copy-1-0",
      path: "t1[5|1]",
    });
  });

  it("names a clip only on the copy that landed on it", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 16, end: 20 }],
    });

    const result = (await copyTo("t1[1|1],t1[5|1]")) as Entry[];

    expect(result.map((entry) => entry.detail)).toStrictEqual([
      undefined,
      "overwrote the clip at t1[5|1]",
    ]);
  });

  // The first copy leaves the rest of the clip under a new id, which Live made,
  // not the call: the second copy covering it overwrites a clip that was there.
  it("does not take what Live left of a clip for a copy of the call", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 16, end: 32 }],
    });

    const result = (await copyTo("t1[5|1],t1[7|1]")) as Entry[];

    expect(result.map((entry) => entry.detail)).toStrictEqual([
      "shortened the clip at t1[7|1]",
      "overwrote the clip at t1[7|1]",
    ]);
  });

  // A copy the later one covers whole is never written, so the later copy is
  // the one that overwrote the clip that was there.
  it("leaves a copy a later copy covers whole unwritten", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 16, end: 20 }],
    });

    expect(await copyTo("t1[5|1],t1[5|1]")).toStrictEqual([
      {
        path: "t1[5|1]",
        detail: "overwritten later in this call by t1[5|1]",
      },
      {
        id: "copy-1-0",
        path: "t1[5|1]",
        detail: "overwrote the clip at t1[5|1]",
      },
    ]);
  });

  // A copy Live declined can still have cleared its range first. The Set
  // changed, so the entry is no skip: it has no `ok: false`.
  it("says what a copy Live declined had already cleared", async () => {
    registerDeclinedLane();

    expect(await copyTo("t1[5|1],t1[9|1]")).toStrictEqual([
      {
        path: "t1[5|1]",
        detail: "Live made no copy there; overwrote the clip at t1[5|1]",
      },
      // The declined write made no clip, so the next one is the lane's first.
      { id: "copy-1-0", path: "t1[9|1]" },
    ]);
  });

  it("answers a lone declined copy that had cleared, without throwing", async () => {
    registerDeclinedLane();

    expect(await copyTo("t1[5|1]")).toStrictEqual({
      path: "t1[5|1]",
      detail: "Live made no copy there; overwrote the clip at t1[5|1]",
    });
  });

  it("still throws a lone declined copy that had cleared nothing", async () => {
    registerEightBeatSource();

    const lane = registerLiveLane({ trackIndex: 1 });

    lane.declineNextWrite();

    await expect(copyTo("t1[5|1]")).rejects.toThrow("Live made no copy there");
  });

  // Each of these copies reaches into the one before it, cutting its back off.
  // The earlier copy is still there, so its entry says it was shortened.
  it("says a copy of the same call cut short at the back was shortened", async () => {
    registerEightBeatSource();
    registerLiveLane({ trackIndex: 1 });

    const result = (await copyTo("t1[5|1],t1[6|1]")) as Entry[];

    expect(result).toStrictEqual([
      {
        id: "copy-1-0",
        path: "t1[5|1]",
        detail: "shortened by t1[6|1] later in this call",
      },
      { id: "copy-1-1", path: "t1[6|1]" },
    ]);
  });

  it("keeps what a copy overwrote when a later copy trims it", async () => {
    registerEightBeatSource();
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "x", start: 16, end: 20 }],
    });

    const result = (await copyTo("t1[5|1],t1[6|1]")) as Entry[];

    expect(result[0]).toStrictEqual({
      id: "copy-1-0",
      path: "t1[5|1]",
      detail:
        "overwrote the clip at t1[5|1]; shortened by t1[6|1] later in this call",
    });
  });
});
