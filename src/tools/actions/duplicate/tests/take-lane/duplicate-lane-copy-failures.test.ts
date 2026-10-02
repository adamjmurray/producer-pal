// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A failure on one lane destination, or one of its clips, keeps that
// destination's place in the result and costs the others nothing.

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  registerLiveLane,
  type LiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  duplicateToLanes,
  type LaneCopyEntry,
  registerLaneSource,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

/**
 * Copy the source track onto the lanes a toPath names.
 * @param toPath - The lane destinations
 * @returns The result
 */
async function copyToLanes<T>(toPath: string): Promise<T> {
  return await duplicateToLanes<T>({ id: "src_track", toPath });
}

/** Make a lane's create throw once the lane is already made. */
function throwAfterMakingLane(track: {
  methods: Record<string, unknown>;
}): void {
  const create = track.methods.create_take_lane as () => unknown;

  track.methods.create_take_lane = () => {
    create();

    throw new Error("Live is unhappy");
  };
}

describe("duplicate track to take lane - a clip that throws", () => {
  it("keeps the other clips, and the failing one's place", async () => {
    registerMainLaneSource([0, 16]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const clip = registerMockObject("src_clip_0", {});

    Object.defineProperty(clip.properties, "end_time", {
      get() {
        throw new Error("Live is unhappy");
      },
    });

    const result = await copyToLanes<LaneCopyEntry>("t1/l0");

    expect(result.clips).toStrictEqual([
      {
        path: "t1/l0[1|1]",
        ok: false,
        detail: "the take-lane copy failed: Live is unhappy",
      },
      expect.objectContaining({ path: "t1/l0[5|1]" }),
    ]);
  });
});

describe("duplicate take lane to a main lane - a clip that throws", () => {
  it("keeps the other clips, and the failing one's place", async () => {
    registerLaneSource([8, 24]);
    registerTakeLaneTrack({ trackIndex: 1 });

    const { properties } = registerMockObject("src_lane_clip_0", {});

    // Re-registering dropped the clip's properties; it still starts at beat 8.
    Object.defineProperty(properties, "start_time", { value: 8 });
    Object.defineProperty(properties, "end_time", {
      get() {
        throw new Error("Live is unhappy");
      },
    });

    const result = await duplicateToLanes<LaneCopyEntry>({
      path: "t0/l0",
      toPath: "t1",
    });

    expect(result.clips).toStrictEqual([
      {
        path: "t1[3|1]",
        ok: false,
        detail: "the promoted copy failed: Live is unhappy",
      },
      expect.objectContaining({ path: "t1[7|1]" }),
    ]);
  });
});

describe("duplicate track to take lane - a clip that clears and then throws", () => {
  const ENTRY = {
    path: "t1/l0[1|1]",
    detail:
      "the take-lane copy failed: Live is unhappy; overwrote the clip at t1/l0[1|1]",
  };

  /** A source clip and a lane whose clip at the same spot the copy covers. */
  function registerSourceAndLane(): LiveLane {
    registerMainLaneSource([0], {}, { end_time: 4 });

    return registerLiveLane({
      trackIndex: 1,
      laneIndex: 0,
      clips: [{ id: "old", start: 0, end: 4 }],
    });
  }

  it("names what the create cleared, and is not a skip", async () => {
    const lane = registerSourceAndLane();
    const laneMock = lookupMockObject("lane-1") as RegisteredMockObject;

    laneMock.methods.create_midi_clip = () => {
      lane.write(0, 4);

      throw new Error("Live is unhappy");
    };

    const result = await copyToLanes<LaneCopyEntry>("t1/l0");

    expect(result.clips).toStrictEqual([ENTRY]);
  });

  // A throw that escapes the re-create itself carries what it cleared too.
  it("names what a throw outside the create cleared", async () => {
    const lane = registerSourceAndLane();
    const source = registerMockObject("src_clip_0", {});
    const read = source.get.getMockImplementation() as (
      prop: string,
    ) => unknown;

    source.get.mockImplementation((prop: string) => {
      if (prop === "has_envelopes") {
        lane.declineNextWrite();
        lane.write(0, 4);

        throw new Error("Live is unhappy");
      }

      return read(prop);
    });

    const result = await copyToLanes<LaneCopyEntry>("t1/l0");

    expect(result.clips).toStrictEqual([ENTRY]);
  });
});

describe("duplicate track to take lane - nothing landed", () => {
  it("skips an existing lane none of whose clips landed", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({
      trackIndex: 1,
      initialLanes: 1,
      clipCreationFails: true,
    });
    registerTakeLaneTrack({ trackIndex: 2 });

    const result = await copyToLanes<LaneCopyEntry[]>("t1/l0,t2/l0");

    expect(result[0]).toStrictEqual(
      expect.objectContaining({
        path: "t1/l0",
        ok: false,
        detail: expect.stringContaining(
          "no clip landed: the take-lane copy failed",
        ),
      }),
    );
    expect(result[1]).toStrictEqual(
      expect.objectContaining({ path: "t2/l0", created: true }),
    );
  });

  it("throws when the one lane it was asked for got no clip", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({
      trackIndex: 1,
      initialLanes: 1,
      clipCreationFails: true,
    });

    await expect(copyToLanes("t1/l0")).rejects.toThrow(
      "no clip landed: the take-lane copy failed",
    );
  });

  it("keeps the lane it made when none of its clips landed", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1, clipCreationFails: true });

    // The lane exists and can't be deleted, so the entry isn't a skip.
    const result = await copyToLanes<LaneCopyEntry>("t1/l0");

    expect(result).toStrictEqual(
      expect.objectContaining({
        path: "t1/l0",
        created: true,
        detail: expect.stringContaining(
          "no clip landed: the take-lane copy failed",
        ),
      }),
    );
    expect(result).not.toHaveProperty("ok");
  });

  it("skips a main lane none of whose clips landed", async () => {
    registerLaneSource([8]);
    registerTakeLaneTrack({ trackIndex: 1, clipCreationFails: true });

    // A main lane makes nothing on the way, so there is nothing to keep.
    await expect(
      duplicateToLanes({ path: "t0/l0", toPath: "t1" }),
    ).rejects.toThrow("no clip landed: the promoted copy failed");
  });
});

describe("duplicate track to take lane - a destination that throws", () => {
  it("skips it when no lane was made, and keeps the others", async () => {
    registerMainLaneSource([0]);

    const failing = registerTakeLaneTrack({ trackIndex: 1 });

    failing.methods.create_take_lane = () => {
      throw new Error("Live is unhappy");
    };

    registerTakeLaneTrack({ trackIndex: 2 });

    const result = await copyToLanes<LaneCopyEntry[]>("t1/l0,t2/l0");

    expect(result[0]).toStrictEqual({
      path: "t1/l0",
      ok: false,
      detail: "Live is unhappy",
    });
    expect(result[1]).toStrictEqual(
      expect.objectContaining({ path: "t2/l0", created: true }),
    );
  });

  it("throws when the one destination it was asked for failed", async () => {
    registerMainLaneSource([0]);

    registerTakeLaneTrack({ trackIndex: 1 }).methods.create_take_lane = () => {
      throw new Error("Live is unhappy");
    };

    await expect(copyToLanes("t1/l0")).rejects.toThrow("Live is unhappy");
  });

  it("keeps the lane it made before the throw", async () => {
    registerMainLaneSource([0]);
    throwAfterMakingLane(registerTakeLaneTrack({ trackIndex: 1 }));

    // The lane can't be deleted, so the entry isn't a skip.
    expect(await copyToLanes("t1/l0")).toStrictEqual({
      path: "t1/l0",
      created: true,
      clips: [],
      detail:
        "the take lane was made, but Live is unhappy; no clip was copied to it",
    });
  });
});
