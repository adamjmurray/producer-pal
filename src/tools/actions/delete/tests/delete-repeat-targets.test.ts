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
  // remove that instead, so only the last mention deletes. The earlier keeps
  // its own slot: N targets named, N entries back.
  it("deletes an object named by both id and path once, and reports both", () => {
    setupTrackMocks({ track_1: String(livePath.track(0)) });

    expect(
      deleteObject({ id: "track_1", path: "t0", type: "track" }),
    ).toStrictEqual([
      {
        id: "track_1",
        detail: 'named again as "t0" later in this call',
      },
      { id: "track_1", deletedPath: "t0" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  // The earlier mention is addressed the way the caller wrote it, not by what
  // it resolved to.
  it("reports the repeat under the caller's own spelling", () => {
    setupTrackMocks({ track_1: String(livePath.track(0)) });

    expect(deleteObject({ path: "t0,t0", type: "track" })).toStrictEqual([
      {
        path: "t0",
        detail: 'named again as "t0" later in this call',
      },
      { id: "track_1", deletedPath: "t0" },
    ]);
  });

  // Each mention holds the slot it was named at, so matching entries against
  // the call by position pairs the right ones.
  it("keeps call order when an id is named again after another target", () => {
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
    });

    expect(
      deleteObject({ id: "track_0,track_1,track_0", type: "track" }),
    ).toStrictEqual([
      {
        id: "track_0",
        detail: "named again as id track_0 later in this call",
      },
      { id: "track_1", deletedPath: "t1" },
      { id: "track_0", deletedPath: "t0" },
    ]);
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_track", 1);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_track", 0);
    expect(liveSet.call).toHaveBeenCalledTimes(2);
  });

  // Every earlier mention is addressed by how it was written. Naming it by what
  // it resolved to would give a path that names whatever slid into the slot.
  it("answers each earlier mention in its own spelling beside the deletes", () => {
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
    });

    expect(
      deleteObject({ id: "track_0,track_1", path: "t1,t0", type: "track" }),
    ).toStrictEqual([
      { id: "track_0", detail: 'named again as "t0" later in this call' },
      { id: "track_1", detail: 'named again as "t1" later in this call' },
      { id: "track_1", deletedPath: "t1" },
      { id: "track_0", deletedPath: "t0" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(2);
  });

  // The later mention was meant to do the work, so when it fails the earlier one
  // was not done through it after all.
  it("fails the earlier mention when the last one fails", () => {
    setupTrackMocks({ track_0: String(livePath.track(0)) });

    liveSet.methods.delete_track = () => {
      throw new Error("Live is busy");
    };

    expect(
      deleteObject({ id: "track_0", path: "t0", type: "track" }),
    ).toStrictEqual([
      {
        id: "track_0",
        ok: false,
        detail: 'not written: "t0" was meant to replace it, but failed',
      },
      { path: "t0", ok: false, detail: "Live is busy" },
    ]);
  });
});
