// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  deleteMockObject,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "../delete.ts";

const LIVE_FAILURE = "Live could not do that";

/**
 * Register tracks t0..., in a Live Set whose `delete_track` runs `onDelete`
 * first for each index, then removes the track.
 * @param count - How many tracks
 * @param onDelete - Runs before each delete; may throw
 * @returns The Live Set
 */
function setUpTracks(
  count: number,
  onDelete: (index: number) => void,
): RegisteredMockObject {
  const ids = Array.from({ length: count }, (_, i) => `track_${i}`);
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...ids) },
    methods: {
      delete_track: (index: unknown) => {
        onDelete(Number(index));
        deleteMockObject(`live_set tracks ${String(index)}`);

        return null;
      },
    },
  });

  for (const [i, id] of ids.entries()) {
    registerMockObject(id, { path: livePath.track(i), type: "Track" });
  }

  return liveSet;
}

describe("deleteObject when Live fails partway", () => {
  beforeEach(() => {
    simulateMockDeletes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives the failing target its own entry and still deletes the rest", () => {
    const liveSet = setUpTracks(3, (index) => {
      if (index === 1) {
        throw new Error(LIVE_FAILURE);
      }
    });

    expect(
      deleteObject({ id: "track_0,track_1,track_2", type: "track" }),
    ).toStrictEqual([
      { id: "track_0", deletedPath: "t0" },
      { id: "track_1", ok: false, detail: LIVE_FAILURE },
      { id: "track_2", deletedPath: "t2" },
    ]);
    // From the end, so the failure at 1 doesn't stop the delete at 0.
    expect(liveSet.call).toHaveBeenCalledTimes(3);
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_track", 2);
    expect(liveSet.call).toHaveBeenNthCalledWith(3, "delete_track", 0);
  });

  it("throws when the one target's delete fails", () => {
    setUpTracks(2, () => {
      throw new Error(LIVE_FAILURE);
    });

    expect(() => deleteObject({ id: "track_0", type: "track" })).toThrow(
      LIVE_FAILURE,
    );
  });

  it("leaves the targets the deadline never reached as skips", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);

    const liveSet = setUpTracks(3, () => {
      // The first delete uses up the time.
      now = start + 5000;
    });

    expect(
      deleteObject(
        { id: "track_0,track_1,track_2", type: "track" },
        { deadline: start + 1000 },
      ),
    ).toStrictEqual([
      {
        id: "track_0",
        ok: false,
        detail: "the request ran out of time; re-run for this target",
      },
      {
        id: "track_1",
        ok: false,
        detail: "the request ran out of time; re-run for this target",
      },
      { id: "track_2", deletedPath: "t2" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });
});
