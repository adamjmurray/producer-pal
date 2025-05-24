// src/tools/update-track.test.js
import { describe, expect, it } from "vitest";
import { liveApiId, liveApiPath, liveApiSet } from "../mock-live-api";
import { updateTrack } from "./update-track";

describe("updateTrack", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id track1":
          return "track1";
        case "id track2":
          return "track2";
        case "id track3":
          return "track3";
        default:
          return "id 0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track1":
          return "live_set tracks 0";
        case "track2":
          return "live_set tracks 1";
        case "track3":
          return "live_set tracks 2";
        default:
          return "";
      }
    });
  });

  it("should update a single track by ID", () => {
    const result = updateTrack({
      ids: "track1",
      name: "Updated Track",
      color: "#FF0000",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Updated Track");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("mute", true);
    expect(liveApiSet).toHaveBeenCalledWith("solo", false);
    expect(liveApiSet).toHaveBeenCalledWith("arm", true);
    expect(result).toEqual({
      id: "track1",
      trackIndex: 0,
      name: "Updated Track",
      color: "#FF0000",
      mute: true,
      solo: false,
      arm: true,
    });
  });

  it("should update multiple tracks by comma-separated IDs", () => {
    const result = updateTrack({
      ids: "track1, track2",
      color: "#00FF00",
      mute: true,
    });

    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("mute", true);
    expect(liveApiSet).toHaveBeenCalledTimes(4); // 2 calls per track

    expect(result).toEqual([
      {
        id: "track1",
        trackIndex: 0,
        color: "#00FF00",
        mute: true,
      },
      {
        id: "track2",
        trackIndex: 1,
        color: "#00FF00",
        mute: true,
      },
    ]);
  });

  it("should handle 'id ' prefixed track IDs", () => {
    const result = updateTrack({
      ids: "id track1",
      name: "Prefixed ID Track",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Prefixed ID Track");
    expect(result).toEqual({
      id: "track1",
      trackIndex: 0,
      name: "Prefixed ID Track",
    });
  });

  it("should not update properties when not provided", () => {
    const result = updateTrack({
      ids: "track1",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Only Name Update");
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "track1",
      trackIndex: 0,
      name: "Only Name Update",
    });
  });

  it("should handle boolean false values correctly", () => {
    const result = updateTrack({
      ids: "track1",
      mute: false,
      solo: false,
      arm: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("mute", false);
    expect(liveApiSet).toHaveBeenCalledWith("solo", false);
    expect(liveApiSet).toHaveBeenCalledWith("arm", false);
    expect(result).toEqual({
      id: "track1",
      trackIndex: 0,
      mute: false,
      solo: false,
      arm: false,
    });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateTrack({})).toThrow("updateTrack failed: ids is required");
    expect(() => updateTrack({ name: "Test" })).toThrow("updateTrack failed: ids is required");
  });

  it("should throw error when track ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => updateTrack({ ids: "nonexistent" })).toThrow(
      'updateTrack failed: track with id "nonexistent" does not exist'
    );
  });

  it("should throw error when any track ID in comma-separated list doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id track1":
          return "track1";
        case "id nonexistent":
          return "id 0";
        default:
          return "id 0";
      }
    });

    expect(() => updateTrack({ ids: "track1, nonexistent", name: "Test" })).toThrow(
      'updateTrack failed: track with id "nonexistent" does not exist'
    );
  });

  it("should throw error when track path cannot be parsed", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") return "invalid_path";
      return "";
    });

    expect(() => updateTrack({ ids: "track1", name: "Test" })).toThrow(
      'updateTrack failed: could not determine trackIndex for id "track1" (path="invalid_path")'
    );
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateTrack({ ids: "track1", name: "Single" });
    const arrayResult = updateTrack({ ids: "track1, track2", name: "Multiple" });

    expect(singleResult).toEqual({
      id: "track1",
      trackIndex: 0,
      name: "Single",
    });
    expect(arrayResult).toEqual([
      {
        id: "track1",
        trackIndex: 0,
        name: "Multiple",
      },
      {
        id: "track2",
        trackIndex: 1,
        name: "Multiple",
      },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateTrack({
      ids: " track1 , track2 , track3 ",
      color: "#0000FF",
    });

    expect(result).toEqual([
      {
        id: "track1",
        trackIndex: 0,
        color: "#0000FF",
      },
      {
        id: "track2",
        trackIndex: 1,
        color: "#0000FF",
      },
      {
        id: "track3",
        trackIndex: 2,
        color: "#0000FF",
      },
    ]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    const result = updateTrack({
      ids: "track1,,track2,  ,track3",
      name: "Filtered",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(3); // Only 3 valid IDs
    expect(result).toEqual([
      {
        id: "track1",
        trackIndex: 0,
        name: "Filtered",
      },
      {
        id: "track2",
        trackIndex: 1,
        name: "Filtered",
      },
      {
        id: "track3",
        trackIndex: 2,
        name: "Filtered",
      },
    ]);
  });
});
