// src/tools/update-track.test.js
import { describe, expect, it } from "vitest";
import { liveApiId, liveApiPath, liveApiSet } from "../mock-live-api";
import { updateTrack } from "./update-track";

describe("updateTrack", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "id 789":
          return "789";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "123":
          return "live_set tracks 0";
        case "456":
          return "live_set tracks 1";
        case "789":
          return "live_set tracks 2";
        default:
          return this._path;
      }
    });
  });

  it("should update a single track by ID", () => {
    const result = updateTrack({
      ids: "123",
      name: "Updated Track",
      color: "#FF0000",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Updated Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "solo",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "arm",
      true,
    );
    expect(result).toEqual({
      id: "123",
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
      ids: "123, 456",
      color: "#00FF00",
      mute: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledTimes(4); // 2 calls per track

    expect(result).toEqual([
      {
        id: "123",
        trackIndex: 0,
        color: "#00FF00",
        mute: true,
      },
      {
        id: "456",
        trackIndex: 1,
        color: "#00FF00",
        mute: true,
      },
    ]);
  });

  it("should handle 'id ' prefixed track IDs", () => {
    const result = updateTrack({
      ids: "id 123",
      name: "Prefixed ID Track",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID Track",
    );
    expect(result).toEqual({
      id: "123",
      trackIndex: 0,
      name: "Prefixed ID Track",
    });
  });

  it("should not update properties when not provided", () => {
    const result = updateTrack({
      ids: "123",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Only Name Update",
    );
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "123",
      trackIndex: 0,
      name: "Only Name Update",
    });
  });

  it("should handle boolean false values correctly", () => {
    const result = updateTrack({
      ids: "123",
      mute: false,
      solo: false,
      arm: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "solo",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "arm",
      false,
    );
    expect(result).toEqual({
      id: "123",
      trackIndex: 0,
      mute: false,
      solo: false,
      arm: false,
    });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateTrack({})).toThrow(
      "updateTrack failed: ids is required",
    );
    expect(() => updateTrack({ name: "Test" })).toThrow(
      "updateTrack failed: ids is required",
    );
  });

  it("should throw error when track ID doesn't exist", () => {
    liveApiId.mockReturnValue("0");
    expect(() => updateTrack({ ids: "nonexistent" })).toThrow(
      'updateTrack failed: track with id "nonexistent" does not exist',
    );
  });

  it("should throw error when any track ID in comma-separated list doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "0";
        default:
          // make default mocks appear to not exist:
          return "0";
      }
    });

    expect(() =>
      updateTrack({ ids: "123, nonexistent", name: "Test" }),
    ).toThrow('updateTrack failed: track with id "nonexistent" does not exist');
  });

  it("should throw error when track path cannot be parsed", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "123") return "invalid_path";
      return this._path;
    });

    expect(() => updateTrack({ ids: "123", name: "Test" })).toThrow(
      'updateTrack failed: could not determine trackIndex for id "123" (path="invalid_path")',
    );
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateTrack({ ids: "123", name: "Single" });
    const arrayResult = updateTrack({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toEqual({
      id: "123",
      trackIndex: 0,
      name: "Single",
    });
    expect(arrayResult).toEqual([
      {
        id: "123",
        trackIndex: 0,
        name: "Multiple",
      },
      {
        id: "456",
        trackIndex: 1,
        name: "Multiple",
      },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateTrack({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toEqual([
      {
        id: "123",
        trackIndex: 0,
        color: "#0000FF",
      },
      {
        id: "456",
        trackIndex: 1,
        color: "#0000FF",
      },
      {
        id: "789",
        trackIndex: 2,
        color: "#0000FF",
      },
    ]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    const result = updateTrack({
      ids: "123,,456,  ,789",
      name: "Filtered",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(3); // Only 3 valid IDs
    expect(result).toEqual([
      {
        id: "123",
        trackIndex: 0,
        name: "Filtered",
      },
      {
        id: "456",
        trackIndex: 1,
        name: "Filtered",
      },
      {
        id: "789",
        trackIndex: 2,
        name: "Filtered",
      },
    ]);
  });
});
