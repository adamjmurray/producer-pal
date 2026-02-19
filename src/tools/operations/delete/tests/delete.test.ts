// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { setupSceneMocks, setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

describe("deleteObject", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
  });

  it("should delete a single track when type is 'track'", () => {
    setupTrackMocks({ track_2: String(livePath.track(1)) });

    const result = deleteObject({ ids: "track_2", type: "track" });

    expect(result).toStrictEqual({
      id: "track_2",
      type: "track",
      deleted: true,
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("should delete multiple tracks in descending index order", () => {
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
      track_2: String(livePath.track(2)),
    });

    const result = deleteObject({
      ids: "track_0,track_1,track_2",
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

    const result = deleteObject({ ids: "scene_2", type: "scene" });

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

    const result = deleteObject({ ids: "scene_0, scene_2", type: "scene" });

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

  it("should throw an error when neither ids nor path is provided", () => {
    const expectedError = "delete failed: ids or path is required";

    expect(() => deleteObject({ ids: undefined, type: "clip" })).toThrow(
      expectedError,
    );
  });

  it("should throw an error when type arg is missing", () => {
    const expectedError = "delete failed: type is required";

    expect(() =>
      deleteObject({ ids: "clip_1" } as unknown as Parameters<
        typeof deleteObject
      >[0]),
    ).toThrow(expectedError);
  });

  it("should throw an error when type arg is invalid", () => {
    const expectedError =
      'delete failed: type must be one of "track", "scene", "clip", "device", or "drum-pad"';

    expect(() => deleteObject({ ids: "clip_1", type: "invalid" })).toThrow(
      expectedError,
    );
  });

  it("should log warning when object doesn't exist", () => {
    mockNonExistentObjects();

    const consoleWarnSpy = vi.spyOn(console, "warn");

    const result = deleteObject({ ids: "999", type: "track" });

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

    const result = deleteObject({ ids: "scene_1", type: "track" });

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
      ids: "track_0, nonexistent, track_2",
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
      ids: "nonexistent1, nonexistent2",
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

  it("should throw error when trying to delete Producer Pal host track", () => {
    registerMockObject("this_device", {
      path: livePath.track(1).device(0),
    });
    registerMockObject("track_1", {
      path: livePath.track(1),
      type: "Track",
    });

    expect(() => deleteObject({ ids: "track_1", type: "track" })).toThrow(
      "cannot delete track hosting the Producer Pal device",
    );
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
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
    });

    const singleResult = deleteObject({ ids: "track_0", type: "track" });
    const arrayResult = deleteObject({
      ids: "track_0, track_1",
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

  it("should throw error when track path is malformed (no track index)", () => {
    registerMockObject("track_0", {
      path: "invalid_path_without_track_index",
      type: "Track",
    });

    expect(() => deleteObject({ ids: "track_0", type: "track" })).toThrow(
      'delete failed: no track index for id "track_0" (path="invalid_path_without_track_index")',
    );
  });

  it("should throw error when scene path is malformed (no scene index)", () => {
    registerMockObject("scene_0", {
      path: "invalid_path_without_scene_index",
      type: "Scene",
    });

    expect(() => deleteObject({ ids: "scene_0", type: "scene" })).toThrow(
      'delete failed: no scene index for id "scene_0" (path="invalid_path_without_scene_index")',
    );
  });

  it("should throw error when clip path is malformed (no track index)", () => {
    registerMockObject("clip_0", {
      path: "invalid_path_without_track_index",
      type: "Clip",
    });

    expect(() => deleteObject({ ids: "clip_0", type: "clip" })).toThrow(
      'delete failed: no track index for id "clip_0" (path="invalid_path_without_track_index")',
    );
  });

  it("should delete a single return track", () => {
    const id = "return_1";
    const returnTrackIndex = 1;

    registerMockObject(id, {
      path: livePath.returnTrack(returnTrackIndex),
      type: "Track",
    });

    const result = deleteObject({ ids: id, type: "track" });

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

  // Device deletion tests are in delete-device.test.js
});
