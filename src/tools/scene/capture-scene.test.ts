// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { captureScene } from "./capture-scene.ts";

describe("captureScene", () => {
  it("should capture the currently playing clips", () => {
    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set view selected_scene") {
        return "live_set scenes 1";
      }

      return this._path;
    });
    mockLiveApiGet({
      "live_set scenes 2": { name: "Captured Scene" },
      LiveSet: { tracks: [] }, // No tracks means no clips
    });

    const result = captureScene();

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "capture_and_insert_scene",
    );

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
      clips: [],
    });
  });

  it("should select a scene before capturing if sceneIndex is provided", () => {
    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set view selected_scene") {
        return "live_set scenes 2";
      }

      return this._path;
    });
    mockLiveApiGet({
      "live_set scenes 3": { name: "Captured Scene after select" },
      LiveSet: { tracks: [] }, // No tracks means no clips
    });

    const result = captureScene({ sceneIndex: 2 });

    expect(result).toStrictEqual({
      id: "live_set/scenes/3",
      sceneIndex: 3,
      clips: [],
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "selected_scene",
      "id live_set/scenes/2",
    );

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "capture_and_insert_scene",
    );
  });

  it("should set the scene name when provided", () => {
    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set view selected_scene") {
        return "live_set scenes 1";
      }

      return this._path;
    });
    mockLiveApiGet({
      LiveSet: { tracks: [] }, // No tracks means no clips
    });

    const result = captureScene({ name: "Captured Custom Name" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "capture_and_insert_scene",
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 2" }),
      "name",
      "Captured Custom Name",
    );

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
      clips: [],
    });
  });

  it("should throw an error when selected scene index can't be determined", () => {
    liveApiPath.mockReturnValue("");
    expect(() => captureScene()).toThrow(
      "capture-scene failed: couldn't determine selected scene index",
    );
  });

  it("should return captured clips with their IDs and track indices", () => {
    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set view selected_scene") {
        return "live_set scenes 0";
      }

      return this._path;
    });
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      // Mock clips at track 0 and 2 to exist, track 1 to not exist (id 0)
      if (this._path === "live_set tracks 1 clip_slots 1 clip") {
        return "0";
      }

      return this._id;
    });
    mockLiveApiGet({
      "live_set scenes 1": { name: "Captured Scene" },
      LiveSet: {
        tracks: ["id", "1", "id", "2", "id", "3"],
      },
    });

    const result = captureScene();

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [
        { id: "live_set/tracks/0/clip_slots/1/clip", trackIndex: 0 },
        { id: "live_set/tracks/2/clip_slots/1/clip", trackIndex: 2 },
      ],
    });
  });
});
