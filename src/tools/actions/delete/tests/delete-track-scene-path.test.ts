// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { setupSceneMocks, setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject by track and scene path", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    clearCapturedWarnings();
    // delete confirms the object is gone, so the mock has to model it going away
    simulateMockDeletes();
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
  });

  it("deletes the track a path names", () => {
    setupTrackMocks({ track_2: String(livePath.track(1)) });

    expect(deleteObject({ path: "t1", type: "track" })).toStrictEqual({
      id: "track_2",
      deletedPath: "t1",
      type: "track",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("deletes a return track a path names", () => {
    setupTrackMocks({ ret_0: String(livePath.returnTrack(0)) });

    expect(deleteObject({ path: "rt0", type: "track" })).toStrictEqual({
      id: "ret_0",
      deletedPath: "rt0",
      type: "track",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_return_track", 0);
  });

  it("deletes the scene a path names", () => {
    setupSceneMocks({ scene_3: livePath.scene(2) });

    expect(deleteObject({ path: "s2", type: "scene" })).toStrictEqual({
      id: "scene_3",
      deletedPath: "s2",
      type: "scene",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 2);
  });

  it("deletes tracks named by id and by path in one call", () => {
    setupTrackMocks({
      track_1: String(livePath.track(0)),
      track_2: String(livePath.track(1)),
    });

    const result = deleteObject({ id: "track_1", path: "t1", type: "track" });

    // Deletes highest index first so the earlier delete doesn't shift the
    // later one, but results come back in the order named: id before path.
    expect(result).toStrictEqual([
      { id: "track_1", deletedPath: "t0", type: "track" },
      { id: "track_2", deletedPath: "t1", type: "track" },
    ]);
  });

  // An empty place is a delete that needed no work: what was asked for has
  // already happened, so the entry says so and the call is not refused.
  it("reports a path that names nothing as nothing to delete", () => {
    mockNonExistentObjects();

    expect(deleteObject({ path: "s9", type: "scene" })).toStrictEqual({
      path: "s9",
      type: "scene",
      reason: "nothing to delete",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses a lone path that names the wrong kind of object", () => {
    expect(() => deleteObject({ path: "t0/s1", type: "track" })).toThrow(
      'invalid path "t0/s1" - names a clip slot, not a track; expected "t<index>", "rt<index>", or "mt"',
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps a wrong-kind path in its slot beside a track it deleted", () => {
    setupTrackMocks({ track_1: String(livePath.track(0)) });

    expect(deleteObject({ path: "t0/s1, t0", type: "track" })).toStrictEqual([
      {
        path: "t0/s1",
        type: "track",
        ok: false,
        reason:
          'invalid path "t0/s1" - names a clip slot, not a track; expected "t<index>", "rt<index>", or "mt"',
      },
      { id: "track_1", deletedPath: "t0", type: "track" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses to delete the main track, which Live has no call for", () => {
    registerMockObject("main", {
      path: livePath.masterTrack(),
      type: "Track",
    });

    expect(() => deleteObject({ path: "mt", type: "track" })).toThrow(
      "Live has no way to delete the main track mt (id main)",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
