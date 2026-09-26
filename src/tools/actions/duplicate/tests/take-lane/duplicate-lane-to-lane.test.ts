// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A take lane as the source of a track copy: its own clips are re-created on
// the lane toPath names, at the positions they already had.

import { beforeEach, describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  CLIPS_ONLY,
  duplicateToLanes,
  type LaneCopyEntry,
  registerLaneSource,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

/** Where a lane source's clips can go, when the call named nowhere. */
const NEEDS_DESTINATION =
  'its clips need a toPath: another lane, as "t3/l0" or "t3/l+", or a track, ' +
  'as "t3", to promote them onto its main lane';

describe("duplicate take lane to take lane", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it("copies the lane a path names onto a new lane, at the same positions", async () => {
    registerLaneSource([8, 24]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      path: "t0/l0",
      toPath: "t1/l0",
    });

    expect(result.path).toBe("t1/l0");
    expect(result.created).toBe(true);
    expect(result.clips.map((clip) => clip.path)).toStrictEqual([
      "t1/l0[3|1]",
      "t1/l0[7|1]",
    ]);
    // A lane copy leaves behind what a lane can't hold, same as a track's.
    expect(result.detail).toBe(CLIPS_ONLY);
  });

  it("copies the lane an id names", async () => {
    const laneId = registerLaneSource([16]);

    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: laneId,
      toPath: "t1/l+",
    });

    expect(result.path).toBe("t1/l0");
    expect(result.clips.map((clip) => clip.path)).toStrictEqual(["t1/l0[5|1]"]);
  });

  it("takes a main lane and a take lane in one call, each by its own kind", async () => {
    const laneId = registerLaneSource([16]);

    // The main-lane source goes on the same track, keeping the lane it holds.
    registerMainLaneSource([0], { take_lanes: children(laneId) });
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry[]>({
      path: "t0,t0/l0",
      toPath: "t1/l0,t1/l1",
    });

    expect(result.map((entry) => entry.path)).toStrictEqual(["t1/l0", "t1/l1"]);
    // Each source copied its own clips: the main lane's at bar 1, the take
    // lane's at bar 5.
    expect(result[0]?.clips.map((clip) => clip.path)).toStrictEqual([
      "t1/l0[1|1]",
    ]);
    expect(result[1]?.clips.map((clip) => clip.path)).toStrictEqual([
      "t1/l1[5|1]",
    ]);
  });

  it("refuses a lane copied onto itself, and keeps the destination beside it", async () => {
    registerLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const result = await duplicateToLanes<LaneCopyEntry[]>({
      path: "t0/l0",
      toPath: "t0/l0,t1/l0",
    });

    expect(result[0]).toStrictEqual({
      path: "t0/l0",
      ok: false,
      detail: `toPath "t0/l0" is the source lane; a lane can't copy onto itself`,
    });
    expect(result[1]?.path).toBe("t1/l0");
  });

  it("refuses a source that appends a lane rather than naming one", async () => {
    registerLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ path: "t0/l+", toPath: "t1/l0" }),
    ).rejects.toThrow(
      'path "t0/l+" appends a take lane; copy from one that already holds clips, as "t2/l0"',
    );
    expect(destination.call).not.toHaveBeenCalled();
  });

  it("refuses a lane path with nothing at it", async () => {
    mockNonExistentObjects();
    registerLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ path: "t0/l3", toPath: "t1/l0" }),
    ).rejects.toThrow('nothing to duplicate at path "t0/l3"');
    expect(capturedWarnings().join("\n")).toContain(
      'no take lane at path "t0/l3"',
    );
  });

  it("refuses a lane source with nothing on it", async () => {
    registerLaneSource([]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1/l0" }),
    ).rejects.toThrow("t0/l0 has no arrangement clips to copy");
  });

  it("makes nothing when a later source's id is bad", async () => {
    mockNonExistentObjects();
    registerMainLaneSource([0]);

    const destination = registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ id: "src_track,999", toPath: "t1/l0,t1/l1" }),
    ).rejects.toThrow('id "999" does not exist');
    // Every source is read before the first lane is made.
    expect(destination.call).not.toHaveBeenCalled();
  });
});

describe("duplicate take lane - a source with nowhere to go", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it("says a lane path needs a destination", async () => {
    registerLaneSource([0]);

    await expect(duplicateToLanes({ path: "t0/l0" })).rejects.toThrow(
      `path "t0/l0" names a take lane; ${NEEDS_DESTINATION}`,
    );
  });

  it("says the same for a lane named by its id", async () => {
    const laneId = registerLaneSource([0]);

    await expect(duplicateToLanes({ id: laneId })).rejects.toThrow(
      `id "${laneId}" names take lane t0/l0; ${NEEDS_DESTINATION}`,
    );
  });

  it("refuses a destination that is neither a lane nor a track", async () => {
    registerLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1/s1" }),
    ).rejects.toThrow(
      'toPath "t1/s1" names no lane or track; a lane\'s clips copy onto ' +
        'another lane, as "t3/l0", or onto a track, as "t3", for its main lane',
    );
  });
});
