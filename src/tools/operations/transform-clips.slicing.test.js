import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "../../test/mock-live-api.js";
import { transformClips } from "./transform-clips.js";

describe("transformClips - slicing", () => {
  it("should slice looped clips and tile to original length", () => {
    const clipId = "clip_1";
    let callCount = 0;

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      // All duplicated clips should also have a valid track path
      if (
        this._id?.startsWith("holding_") ||
        this._id?.startsWith("moved_") ||
        this._id?.startsWith("tile_")
      ) {
        return "live_set tracks 0 arrangement_clips 1";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [1]; // Looped clip
        }
        if (prop === "start_time") {
          return [0.0];
        }
        if (prop === "end_time") {
          return [16.0]; // 4 bars long
        }
        if (prop === "loop_start") {
          return [0.0];
        }
        if (prop === "loop_end") {
          return [4.0];
        }
        if (prop === "end_marker") {
          return [4.0];
        }
      }
      // Mocks for holding/moved clips
      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") {
          return [40000 + 4]; // Holding area position + shortened length
        }
        if (prop === "loop_start") {
          return [0.0];
        }
        if (prop === "start_marker") {
          return [0.0];
        }
      }
      if (this._id?.startsWith("moved_") || this._id?.startsWith("tile_")) {
        if (prop === "loop_start") {
          return [0.0];
        }
        if (prop === "start_marker") {
          return [0.0];
        }
      }
      if (this._path === "live_set tracks 0") {
        if (prop === "track_index") {
          return [0];
        }
      }
      return [0];
    });

    // Mock liveApiCall to return clip IDs for duplicate_clip_to_arrangement
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;
        if (callCount === 1) {
          // First call: duplicate to holding
          return ["id", "holding_1"];
        } else if (callCount === 2) {
          // Second call: move from holding to original position
          return ["id", "moved_1"];
        } else {
          // Subsequent calls: tiling
          return ["id", `tile_${callCount}`];
        }
      }
      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
      return undefined;
    });

    transformClips({
      clipIds: clipId,
      slice: "1:0.0", // 1 bar = 4 beats slice
      seed: 12345,
    });

    // Should create temp clip to shorten
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );

    // Should call tileClipToRange via arrangement-tiling helpers
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should skip clips smaller than slice size", () => {
    const clipId = "clip_1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [1];
        }
        if (prop === "start_time") {
          return [0.0];
        }
        if (prop === "end_time") {
          return [2.0]; // 2 beats long
        }
      }
      return [0];
    });

    const result = transformClips({
      clipIds: clipId,
      slice: "1:0.0", // 1 bar = 4 beats (larger than clip)
      seed: 12345,
    });

    // Clip should not be modified
    expect(result.clipIds).toEqual([clipId]);

    // Should not create temp clips or tiles
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("should warn when slice is used with non-arrangement clips", () => {
    const clipId = "clip_1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0]; // Session clip
        }
      }
      return [0];
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    transformClips({
      clipIds: clipId,
      slice: "1:0.0",
      seed: 12345,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("slice requires arrangement clips"),
    );
  });

  it("should warn when slice is used with unlooped clips", () => {
    const clipId = "clip_1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [0]; // Not looped
        }
        if (prop === "start_time") {
          return [0.0];
        }
        if (prop === "end_time") {
          return [16.0];
        }
      }
      return [0];
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    transformClips({
      clipIds: clipId,
      slice: "1:0.0",
      seed: 12345,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("slice only applies to looped clips"),
    );
  });

  it("should throw error when slice is <= 0", () => {
    const clipId = "clip_1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [1];
        }
      }
      return [0];
    });

    expect(() =>
      transformClips({
        clipIds: clipId,
        slice: "0:0.0",
        seed: 12345,
      }),
    ).toThrow("slice must be greater than 0");
  });

  it("should stop slicing when MAX_SLICES limit is reached", () => {
    const clip1Id = "clip_1";
    const clip2Id = "clip_2";
    let sliceOperationCount = 0;

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clip1Id;
      }
      if (this._path === "id clip_2") {
        return clip2Id;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clip1Id) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      if (this._id === clip2Id) {
        return "live_set tracks 0 arrangement_clips 1";
      }
      if (
        this._id?.startsWith("holding_") ||
        this._id?.startsWith("moved_") ||
        this._id?.startsWith("tile_")
      ) {
        return "live_set tracks 0 arrangement_clips 2";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clip1Id || this._id === clip2Id) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clip1Id || this._id === clip2Id) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [1];
        }
        if (prop === "start_time") {
          return [0];
        }
        if (prop === "end_time") {
          // 8 beats = 2 bars, which creates 64 slices at 0.125 beats (32nd notes)
          return [8];
        }
        if (prop === "loop_start") {
          return [0.0];
        }
        if (prop === "loop_end") {
          return [1.0];
        }
        if (prop === "end_marker") {
          return [1.0];
        }
      }
      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") {
          return [40000 + 0.125];
        }
        if (prop === "loop_start") {
          return [0.0];
        }
        if (prop === "start_marker") {
          return [0.0];
        }
      }
      if (this._id?.startsWith("moved_") || this._id?.startsWith("tile_")) {
        if (prop === "loop_start") {
          return [0.0];
        }
        if (prop === "start_marker") {
          return [0.0];
        }
      }
      if (this._path === "live_set tracks 0") {
        if (prop === "track_index") {
          return [0];
        }
      }
      return [0];
    });
    liveApiCall.mockImplementation(function (method) {
      // Track when we duplicate/move clips (which happens during slicing)
      if (method === "duplicate_clip_to_arrangement") {
        sliceOperationCount++;
        return ["id", `dup_${sliceOperationCount}`];
      }
      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
      return undefined;
    });

    // First clip would create 64 slices (at the limit)
    // Second clip would also create 64 slices (exceeding limit)
    // Should throw an error when processing second clip
    expect(() =>
      transformClips({
        clipIds: `${clip1Id},${clip2Id}`,
        slice: "0:0.125", // 32nd notes: creates exactly 64 slices for 2-bar clip
        seed: 12345,
      }),
    ).toThrow(/would create 64 slices.*Maximum 64 slices total/);
  });
});
