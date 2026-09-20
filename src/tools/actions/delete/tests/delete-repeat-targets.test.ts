// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject with a target named twice", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    // delete confirms the object is gone, so the mock has to model it going away
    simulateMockDeletes();
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
  });

  // Deleting one object twice would shift a different one into the slot and
  // remove that instead, so only the first mention deletes. The second keeps
  // its own slot: N targets named, N entries back.
  it("deletes an object named by both id and path once, and reports both", () => {
    setupTrackMocks({ track_1: String(livePath.track(0)) });

    expect(
      deleteObject({ id: "track_1", path: "t0", type: "track" }),
    ).toStrictEqual([
      { id: "track_1", deletedPath: "t0" },
      {
        id: "track_1",
        path: "t0",
        reason: "already named as id track_1 earlier in this call",
      },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  // The repeat resolved to an object, so it reports its id like every other
  // entry, beside the path the caller wrote.
  it("reports the repeat under the caller's own spelling", () => {
    setupTrackMocks({ track_1: String(livePath.track(0)) });

    expect(deleteObject({ path: "t0,t0", type: "track" })).toStrictEqual([
      { id: "track_1", deletedPath: "t0" },
      {
        id: "track_1",
        path: "t0",
        reason: 'already named as "t0" earlier in this call',
      },
    ]);
  });

  // The repeat holds the slot it was named at, not the first mention's, so
  // matching entries against the call by position pairs the right ones.
  it("keeps call order when an id is named again after another target", () => {
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
    });

    expect(
      deleteObject({ id: "track_0,track_1,track_0", type: "track" }),
    ).toStrictEqual([
      { id: "track_0", deletedPath: "t0" },
      { id: "track_1", deletedPath: "t1" },
      {
        id: "track_0",
        reason: "already named as id track_0 earlier in this call",
      },
    ]);
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_track", 1);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_track", 0);
    expect(liveSet.call).toHaveBeenCalledTimes(2);
  });
});
