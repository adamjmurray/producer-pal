// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { setupSceneMocks, setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    // delete confirms the object is gone, so the mock has to model it going away
    simulateMockDeletes();
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
  });

  it("should delete a single track when type is 'track'", () => {
    setupTrackMocks({ track_2: String(livePath.track(1)) });

    const result = deleteObject({ id: "track_2", type: "track" });

    expect(result).toStrictEqual({
      id: "track_2",
      type: "track",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  // A permanent alias, not a migration: models reach for the plural on their
  // own, so it keeps working.
  it("still deletes by the ids alias", () => {
    setupTrackMocks({ track_2: String(livePath.track(1)) });

    expect(deleteObject({ ids: "track_2", type: "track" })).toStrictEqual({
      id: "track_2",
      type: "track",
      deleted: true,
    });
  });

  it("should delete multiple tracks in descending index order", () => {
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
      track_2: String(livePath.track(2)),
    });

    const result = deleteObject({
      id: "track_0,track_1,track_2",
      type: "track",
    });

    // Should delete in descending order (2, 1, 0) to maintain indices
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_track", 2);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_track", 1);
    expect(liveSet.call).toHaveBeenNthCalledWith(3, "delete_track", 0);

    expect(result).toStrictEqual([
      { id: "track_2", type: "track", deleted: true },
      { id: "track_1", type: "track", deleted: true },
      { id: "track_0", type: "track", deleted: true },
    ]);
  });

  it("should delete a single scene when type is 'scene'", () => {
    setupSceneMocks({ scene_2: livePath.scene(1) });

    const result = deleteObject({ id: "scene_2", type: "scene" });

    expect(result).toStrictEqual({
      id: "scene_2",
      type: "scene",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 1);
  });

  it("should delete multiple scenes in descending index order", () => {
    setupSceneMocks({
      scene_0: livePath.scene(0),
      scene_2: livePath.scene(2),
    });

    const result = deleteObject({ id: "scene_0, scene_2", type: "scene" });

    // Should delete in descending order (2, 0) to maintain indices
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_scene", 2);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_scene", 0);

    expect(result).toStrictEqual([
      { id: "scene_2", type: "scene", deleted: true },
      { id: "scene_0", type: "scene", deleted: true },
    ]);
  });

  it("should delete multiple clips (order doesn't matter for clips)", () => {
    const ids = "clip_0_0,clip_1_1";

    registerMockObject("clip_0_0", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
    });
    registerMockObject("clip_1_1", {
      path: livePath.track(1).clipSlot(1).clip(),
      type: "Clip",
    });
    const track0 = registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
    });
    const track1 = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
    });

    const result = deleteObject({ ids, type: "clip" });

    expect(track0.call).toHaveBeenCalledWith("delete_clip", "id clip_0_0");
    expect(track1.call).toHaveBeenCalledWith("delete_clip", "id clip_1_1");

    expect(result).toStrictEqual([
      { id: "clip_0_0", type: "clip", deleted: true },
      { id: "clip_1_1", type: "clip", deleted: true },
    ]);
  });

  // Saves a read-then-delete round trip: a caller that knows where the clip is
  // shouldn't have to read it first just to learn its id.
  it("should delete clips addressed by path", () => {
    registerMockObject("clip_0_0", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
    });
    const track0 = registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
    });

    const result = deleteObject({ path: "t0/s0", type: "clip" });

    expect(track0.call).toHaveBeenCalledWith("delete_clip", "id clip_0_0");
    expect(result).toStrictEqual({
      id: "clip_0_0",
      type: "clip",
      deleted: true,
    });
  });

  // `path` takes a list too, so the plural is the same guess `ids` is.
  it("still deletes by the paths alias", () => {
    registerMockObject("clip_0_0", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
    });
    const track0 = registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
    });

    deleteObject({ paths: "t0/s0", type: "clip" });

    expect(track0.call).toHaveBeenCalledWith("delete_clip", "id clip_0_0");
  });

  it("should warn and skip a clip path with no clip", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn");

    mockNonExistentObjects();

    expect(deleteObject({ path: "t0/s9", type: "clip" })).toStrictEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'delete: no clip at path "t0/s9"',
    );
  });

  it("should warn and skip take-lane clips (cannot delete via API)", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn");

    registerMockObject("take_lane_clip", {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
      type: "Clip",
    });
    const track0 = registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
    });

    const result = deleteObject({ id: "take_lane_clip", type: "clip" });

    expect(track0.call).not.toHaveBeenCalledWith(
      "delete_clip",
      expect.anything(),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("cannot delete take-lane clip"),
    );
    expect(result).toStrictEqual({
      id: "take_lane_clip",
      type: "clip",
      deleted: false,
    });
  });

  it("should throw an error when neither id nor path is provided", () => {
    const expectedError = "delete failed: id or path is required";

    expect(() => deleteObject({ id: undefined, type: "clip" })).toThrow(
      expectedError,
    );
  });

  it("should throw an error when type arg is missing", () => {
    const expectedError = "delete failed: type is required";

    expect(() =>
      deleteObject({ id: "clip_1" } as unknown as Parameters<
        typeof deleteObject
      >[0]),
    ).toThrow(expectedError);
  });

  it("should throw an error when type arg is invalid", () => {
    const expectedError =
      'delete failed: type must be one of "track", "scene", "clip", "device", "drum-pad", "chain"';

    expect(() => deleteObject({ id: "clip_1", type: "invalid" })).toThrow(
      expectedError,
    );
  });

  it("should log warning when object doesn't exist", () => {
    mockNonExistentObjects();

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const result = deleteObject({ id: "999", type: "track" });

    expect(result).toStrictEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'delete: id "999" does not exist',
    );
  });

  it("should log warning when object is wrong type", () => {
    registerMockObject("scene_1", {
      path: livePath.scene(0),
      type: "Scene",
    });

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const result = deleteObject({ id: "scene_1", type: "track" });

    expect(result).toStrictEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'delete: id "scene_1" is not a track (found Scene)',
    );
  });

  it("should skip invalid IDs in comma-separated list and delete valid ones", () => {
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_2: String(livePath.track(2)),
    });
    mockNonExistentObjects();

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const result = deleteObject({
      id: "track_0, nonexistent, track_2",
      type: "track",
    });

    // Should delete valid tracks in descending order (track_2, then track_0)
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 2);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 0);

    expect(result).toStrictEqual([
      { id: "track_2", type: "track", deleted: true },
      { id: "track_0", type: "track", deleted: true },
    ]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'delete: id "nonexistent" does not exist',
    );
  });

  it("should return empty array when all IDs are invalid", () => {
    mockNonExistentObjects();

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const result = deleteObject({
      id: "nonexistent1, nonexistent2",
      type: "track",
    });

    expect(result).toStrictEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'delete: id "nonexistent1" does not exist',
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'delete: id "nonexistent2" does not exist',
    );
  });

  it("should warn and skip when trying to delete Producer Pal host track", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerMockObject("this_device", {
      path: livePath.track(1).device(0),
    });
    registerMockObject("track_1", {
      path: livePath.track(1),
      type: "Track",
    });

    const result = deleteObject({ id: "track_1", type: "track" });

    expect(result).toStrictEqual({
      id: "track_1",
      type: "track",
      deleted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "cannot delete track hosting the Producer Pal device",
      ),
    );
    warnSpy.mockRestore();
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const ids = " track_0 , track_1 ";

    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
    });
    const result = deleteObject({ ids, type: "track" });

    expect(result).toStrictEqual([
      { id: "track_1", type: "track", deleted: true },
      { id: "track_0", type: "track", deleted: true },
    ]);
  });

  it("should return single object for single ID and array for multiple IDs", () => {
    // Separate tracks per call: a second delete of track_0 would find it gone.
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
      track_2: String(livePath.track(2)),
    });

    const singleResult = deleteObject({ id: "track_0", type: "track" });
    const arrayResult = deleteObject({
      id: "track_1, track_2",
      type: "track",
    });

    expect(singleResult).toStrictEqual({
      id: "track_0",
      type: "track",
      deleted: true,
    });
    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
  });

  it("should warn and skip when track path is malformed (no track index)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerMockObject("track_0", {
      path: "invalid_path_without_track_index",
      type: "Track",
    });

    const result = deleteObject({ id: "track_0", type: "track" });

    expect(result).toStrictEqual({
      id: "track_0",
      type: "track",
      deleted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no track index for id "track_0"'),
    );
    warnSpy.mockRestore();
  });

  it("should warn and skip when scene path is malformed (no scene index)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerMockObject("scene_0", {
      path: "invalid_path_without_scene_index",
      type: "Scene",
    });

    const result = deleteObject({ id: "scene_0", type: "scene" });

    expect(result).toStrictEqual({
      id: "scene_0",
      type: "scene",
      deleted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no scene index for id "scene_0"'),
    );
    warnSpy.mockRestore();
  });

  it("should warn and skip when clip path is malformed (no track index)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerMockObject("clip_0", {
      path: "invalid_path_without_track_index",
      type: "Clip",
    });

    const result = deleteObject({ id: "clip_0", type: "clip" });

    expect(result).toStrictEqual({
      id: "clip_0",
      type: "clip",
      deleted: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no track index for id "clip_0"'),
    );
    warnSpy.mockRestore();
  });

  it("should delete a single return track", () => {
    const id = "return_1";
    const returnTrackIndex = 1;

    registerMockObject(id, {
      path: livePath.returnTrack(returnTrackIndex),
      type: "Track",
    });

    const result = deleteObject({ id: id, type: "track" });

    expect(result).toStrictEqual({ id, type: "track", deleted: true });
    expect(liveSet.call).toHaveBeenCalledWith(
      "delete_return_track",
      returnTrackIndex,
    );
  });

  it("should delete multiple return tracks in descending index order", () => {
    const ids = "return_0,return_2";

    registerMockObject("return_0", {
      path: livePath.returnTrack(0),
      type: "Track",
    });
    registerMockObject("return_2", {
      path: livePath.returnTrack(2),
      type: "Track",
    });

    const result = deleteObject({ ids, type: "track" });

    // Should delete in descending order (2, 0) to maintain indices
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_return_track", 2);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_return_track", 0);

    expect(result).toStrictEqual([
      { id: "return_2", type: "track", deleted: true },
      { id: "return_0", type: "track", deleted: true },
    ]);
  });

  it("should delete multi-digit track indices in descending order", () => {
    // Two-digit indices guard both the sort regex and the delete regex: a
    // `\d`-only match reads "13" as "1", which would collapse the descending
    // order AND pass a truncated index to delete_track.
    setupTrackMocks({
      track_2: String(livePath.track(2)),
      track_13: String(livePath.track(13)),
    });

    deleteObject({ id: "track_2,track_13", type: "track" });

    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_track", 13);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_track", 2);
  });

  it("should delete a return track at a multi-digit index", () => {
    registerMockObject("return_12", {
      path: livePath.returnTrack(12),
      type: "Track",
    });

    const result = deleteObject({ id: "return_12", type: "track" });

    expect(result).toStrictEqual({
      id: "return_12",
      type: "track",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_return_track", 12);
  });

  it("should delete multi-digit scene indices in descending order", () => {
    setupSceneMocks({
      scene_3: livePath.scene(3),
      scene_12: livePath.scene(12),
    });

    deleteObject({ id: "scene_3,scene_12", type: "scene" });

    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_scene", 12);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_scene", 3);
  });

  it("should delete a clip on a multi-digit track index", () => {
    registerMockObject("clip_10_0", {
      path: livePath.track(10).clipSlot(0).clip(),
      type: "Clip",
    });
    const track10 = registerMockObject("live_set/tracks/10", {
      path: livePath.track(10),
    });

    const result = deleteObject({ id: "clip_10_0", type: "clip" });

    expect(result).toStrictEqual({
      id: "clip_10_0",
      type: "clip",
      deleted: true,
    });
    // A truncated "\d" would resolve track index 1, calling delete_clip on the
    // wrong track — assert the two-digit track's own parent was called.
    expect(track10.call).toHaveBeenCalledWith("delete_clip", "id clip_10_0");
  });

  // Device deletion tests are in delete-device.test.js
});
