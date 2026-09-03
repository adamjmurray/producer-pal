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
      type: "track",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("deletes a return track a path names", () => {
    setupTrackMocks({ ret_0: String(livePath.returnTrack(0)) });

    expect(deleteObject({ path: "rt0", type: "track" })).toStrictEqual({
      id: "ret_0",
      type: "track",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_return_track", 0);
  });

  it("deletes the scene a path names", () => {
    setupSceneMocks({ scene_3: livePath.scene(2) });

    expect(deleteObject({ path: "s2", type: "scene" })).toStrictEqual({
      id: "scene_3",
      type: "scene",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 2);
  });

  it("deletes tracks named by id and by path in one call", () => {
    setupTrackMocks({
      track_1: String(livePath.track(0)),
      track_2: String(livePath.track(1)),
    });

    const result = deleteObject({ id: "track_1", path: "t1", type: "track" });

    // Highest index first, so the earlier delete doesn't shift the later one.
    expect(result).toStrictEqual([
      { id: "track_2", type: "track", deleted: true },
      { id: "track_1", type: "track", deleted: true },
    ]);
  });

  it("reports a path that names nothing rather than dropping it", () => {
    mockNonExistentObjects();

    expect(deleteObject({ path: "s9", type: "scene" })).toStrictEqual({
      path: "s9",
      type: "scene",
      deleted: false,
    });
    expect(capturedWarnings()).toContain('delete: nothing at path "s9"');
  });

  it("reports a path that names the wrong kind of object", () => {
    expect(deleteObject({ path: "t0/s1", type: "track" })).toStrictEqual({
      path: "t0/s1",
      type: "track",
      deleted: false,
    });
    expect(capturedWarnings()).toContain(
      'delete: invalid path "t0/s1" - names a clip slot, not a track; expected "t<index>", "rt<index>", or "mt"',
    );
  });

  it("refuses to delete the main track, which Live has no call for", () => {
    registerMockObject("main", {
      path: livePath.masterTrack(),
      type: "Track",
    });

    expect(deleteObject({ path: "mt", type: "track" })).toStrictEqual({
      id: "main",
      type: "track",
      deleted: false,
    });
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toContain(
      "delete: Live has no way to delete the main track mt (id main), skipping",
    );
  });
});
