import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "../../test/mock-live-api.js";
import { transformClips } from "./transform-clips.js";

describe("transformClips", () => {
  it("should throw error when clipIds and arrangementTrackId are missing", () => {
    expect(() => transformClips()).toThrow(
      "transformClips failed: clipIds or arrangementTrackId is required",
    );
    expect(() => transformClips({})).toThrow(
      "transformClips failed: clipIds or arrangementTrackId is required",
    );
  });

  it("should return clipIds and seed when provided valid clips", () => {
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
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    const result = transformClips({ clipIds: clipId, seed: 12345 });

    expect(result).toEqual({ clipIds: [clipId], seed: 12345 });
  });

  it("should generate seed from Date.now() when not provided", () => {
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
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    const result = transformClips({ clipIds: clipId });

    expect(result).toHaveProperty("clipIds");
    expect(result).toHaveProperty("seed");
    expect(typeof result.seed).toBe("number");
    expect(result.seed).toBeGreaterThan(0);
  });

  it("should handle comma-separated clip IDs", () => {
    const clipIds = "clip_1,clip_2,clip_3";
    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return "clip_1";
      }
      if (this._path === "id clip_2") {
        return "clip_2";
      }
      if (this._path === "id clip_3") {
        return "clip_3";
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip_1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      if (this._id === "clip_2") {
        return "live_set tracks 0 clip_slots 1 clip";
      }
      if (this._id === "clip_3") {
        return "live_set tracks 0 clip_slots 2 clip";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (["clip_1", "clip_2", "clip_3"].includes(this._id)) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (["clip_1", "clip_2", "clip_3"].includes(this._id)) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    const result = transformClips({ clipIds, seed: 12345 });

    expect(result.clipIds).toEqual(["clip_1", "clip_2", "clip_3"]);
  });

  it("should apply velocity modifications to MIDI clip notes", () => {
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
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (this._id === clipId && method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              id: "0",
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              velocity_deviation: 0,
              probability: 1.0,
            },
          ],
        });
      }
    });

    transformClips({
      clipIds: clipId,
      velocityMin: -10,
      velocityMax: 10,
      seed: 12345,
    });

    // Verify apply_note_modifications was called
    expect(liveApiCall).toHaveBeenCalledWith(
      "apply_note_modifications",
      expect.stringContaining('"notes"'),
    );
  });

  it("should apply gain modifications to audio clips", () => {
    const clipId = "audio_clip_1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id audio_clip_1") {
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
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [0];
        }
        if (prop === "is_audio_clip") {
          return [1];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "gain") {
          return [0.85];
        }
        if (prop === "pitch_coarse") {
          return [0];
        }
        if (prop === "pitch_fine") {
          return [0];
        }
      }
      return [0];
    });

    transformClips({
      clipIds: clipId,
      gainMin: 0.9,
      gainMax: 1.1,
      seed: 12345,
    });

    // Verify gain was set
    expect(liveApiSet).toHaveBeenCalledWith("gain", expect.any(Number));
  });

  it("should warn when no valid clips found", () => {
    liveApiId.mockReturnValue("id 0"); // Non-existent clips

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = transformClips({ clipIds: "nonexistent", seed: 12345 });

    expect(result).toEqual({ clipIds: [], seed: 12345 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no valid clips found"),
    );
  });

  it("should produce consistent results with same seed", () => {
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
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    let capturedNotes1;
    let capturedNotes2;

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (this._id === clipId && method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              id: "0",
              pitch: 60,
              start_time: 0.0,
              duration: 1.0,
              velocity: 100,
              velocity_deviation: 0,
              probability: 1.0,
            },
          ],
        });
      }
      if (this._id === clipId && method === "apply_note_modifications") {
        const notes = JSON.parse(_args[0]).notes;
        if (!capturedNotes1) {
          capturedNotes1 = notes;
        } else {
          capturedNotes2 = notes;
        }
      }
    });

    // Run twice with same seed
    transformClips({
      clipIds: clipId,
      velocityMin: -20,
      velocityMax: 20,
      seed: 99999,
    });
    transformClips({
      clipIds: clipId,
      velocityMin: -20,
      velocityMax: 20,
      seed: 99999,
    });

    // Should produce identical results
    expect(capturedNotes1).toEqual(capturedNotes2);
  });

  it("should accept arrangementTrackId with arrangementStart/Length instead of clipIds", () => {
    const arrangementTrackId = "id 1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id 1") {
        return arrangementTrackId;
      }
      if (this._path === "id clip_1") {
        return "clip_1";
      }
      if (this._path === "id clip_2") {
        return "clip_2";
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === arrangementTrackId) {
        return "live_set tracks 0";
      }
      if (this._id === "clip_1") {
        return "live_set tracks 0 arrangement_clips 0";
      }
      if (this._id === "clip_2") {
        return "live_set tracks 0 arrangement_clips 1";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (
        this._id === arrangementTrackId ||
        this._path === arrangementTrackId
      ) {
        return "Track";
      }
      if (["clip_1", "clip_2"].includes(this._id)) {
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
      if (
        (this._id === arrangementTrackId ||
          this._path === arrangementTrackId) &&
        prop === "arrangement_clips"
      ) {
        return ["id", "clip_1", "id", "clip_2"];
      }
      if (this._id === "clip_1") {
        if (prop === "start_time") {
          return [0.0]; // At bar 1
        }
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      if (this._id === "clip_2") {
        if (prop === "start_time") {
          return [8.0]; // At bar 3
        }
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    const result = transformClips({
      arrangementTrackId,
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    // 4 bars = 16 beats, so range is [0, 16)
    // clip_1 at 0.0 and clip_2 at 8.0 are both in range
    expect(result.clipIds).toEqual(["clip_1", "clip_2"]);
  });

  it("should prioritize clipIds over arrangementTrackId when both provided", () => {
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
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [0];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    const result = transformClips({
      clipIds: clipId,
      arrangementTrackId: "id 1", // Should be ignored
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    expect(result.clipIds).toEqual([clipId]);
  });

  it("should filter clips by start_time in arrangement range", () => {
    const arrangementTrackId = "id 1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id 1") {
        return arrangementTrackId;
      }
      if (this._path === "id clip_1") {
        return "clip_1";
      }
      if (this._path === "id clip_2") {
        return "clip_2";
      }
      if (this._path === "id clip_3") {
        return "clip_3";
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === arrangementTrackId) {
        return "live_set tracks 0";
      }
      if (this._id === "clip_1") {
        return "live_set tracks 0 arrangement_clips 0";
      }
      if (this._id === "clip_2") {
        return "live_set tracks 0 arrangement_clips 1";
      }
      if (this._id === "clip_3") {
        return "live_set tracks 0 arrangement_clips 2";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (
        this._id === arrangementTrackId ||
        this._path === arrangementTrackId
      ) {
        return "Track";
      }
      if (["clip_1", "clip_2", "clip_3"].includes(this._id)) {
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
      if (
        (this._id === arrangementTrackId ||
          this._path === arrangementTrackId) &&
        prop === "arrangement_clips"
      ) {
        return ["id", "clip_1", "id", "clip_2", "id", "clip_3"];
      }
      if (this._id === "clip_1") {
        if (prop === "start_time") {
          return [0.0]; // Bar 1
        }
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      if (this._id === "clip_2") {
        if (prop === "start_time") {
          return [4.0]; // Bar 2
        }
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      if (this._id === "clip_3") {
        if (prop === "start_time") {
          return [16.0]; // Bar 5 (outside range)
        }
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "length") {
          return [4.0];
        }
      }
      return [0];
    });

    const result = transformClips({
      arrangementTrackId,
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    // Should include clips starting at 0.0 and 4.0, but not 16.0
    expect(result.clipIds).toEqual(["clip_1", "clip_2"]);
  });

  it("should warn when no clips found in arrangement range", () => {
    const arrangementTrackId = "id 1";
    liveApiId.mockImplementation(function () {
      if (this._path === "id 1") {
        return arrangementTrackId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === arrangementTrackId) {
        return "live_set tracks 0";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (
        this._id === arrangementTrackId ||
        this._path === arrangementTrackId
      ) {
        return "Track";
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
      if (
        (this._id === arrangementTrackId ||
          this._path === arrangementTrackId) &&
        prop === "arrangement_clips"
      ) {
        return []; // No clips
      }
      return [0];
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = transformClips({
      arrangementTrackId,
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    expect(result).toEqual({ clipIds: [], seed: 12345 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no clips found in arrangement range"),
    );
  });

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
});
