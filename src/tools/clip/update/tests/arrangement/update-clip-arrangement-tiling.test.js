import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import {
  mockContext,
  setupArrangementClipPath,
  setupMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";

describe("updateClip - arrangementLength (clean tiling)", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("should tile clip with exact multiples (no remainder) - extends existing", () => {
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, (id) => id === "789" || id === 1000);

    mockLiveApiGet({
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        start_time: 0.0,
        end_time: 4.0, // 1 bar currently visible
        loop_start: 0.0,
        loop_end: 12.0, // clip.length = 12 beats (3 bars of content)
        start_marker: 0.0,
        end_marker: 12.0,
        name: "Test",
        color: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
        trackIndex,
      },
      1000: { end_time: 12.0, start_marker: 0.0, loop_start: 0.0 },
      LiveSet: {
        tracks: ["id", 0],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      "live_set tracks 0": {
        arrangement_clips: ["id", 789],
      },
    });

    // Mock tiling flow (non-destructive duplication)
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id 1000`;
      }
    });

    const result = updateClip({
      ids: "789",
      arrangementLength: "3:0", // 3 bars = 12 beats, matches clip.length exactly
    });

    // Should tile using non-destructive duplication (preserves envelopes)
    // currentArrangementLength (4) < clipLength (12) triggers tiling
    // Keeps original clip and tiles after it at positions 4 and 8
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      4.0,
    );
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      8.0,
    );

    expect(result).toStrictEqual([
      { id: "789" },
      { id: "1000" },
      { id: "1000" },
    ]); // Original + tiled clips
  });

  it("should handle insufficient content by tiling what exists", () => {
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, (id) => id === "789" || id === 1000);

    mockLiveApiGet({
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        looping: 1, // This is a looped clip
        start_time: 0.0,
        end_time: 4.0,
        loop_start: 0.0,
        loop_end: 4.0, // clip.length = 4 beats
        start_marker: 0.0,
        end_marker: 4.0,
        signature_numerator: 4,
        signature_denominator: 4,
        trackIndex,
      },
      LiveSet: {
        tracks: ["id", 0],
      },
      "live_set tracks 0": {
        arrangement_clips: ["id", 789],
      },
    });

    // Mock duplicate_clip_to_arrangement
    let nextId = 1000;

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        const id = nextId++;

        mockLiveApiGet({
          [id]: {
            end_time: (args[1] || 0) + 4.0,
          },
        });

        return `id ${id}`;
      }
    });

    const result = updateClip({
      ids: "789",
      arrangementLength: "2:0", // 8 beats > 4 beats (clip.length), tiles existing content twice
    });

    // Should duplicate once (2 tiles total: existing clip + 1 duplicate)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      4.0,
    );

    expect(result).toStrictEqual([{ id: "789" }, { id: "1000" }]);
  });

  it("should work with no remainder (single tile)", () => {
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, ["789"]);

    mockLiveApiGet({
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 0.0,
        end_time: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        start_marker: 0.0,
        signature_numerator: 4,
        signature_denominator: 4,
        trackIndex,
      },
      LiveSet: {
        tracks: ["id", 0],
      },
      "live_set tracks 0": {
        arrangement_clips: ["id", 789],
      },
    });

    const result = updateClip({
      ids: "789",
      arrangementLength: "1:0", // Same as clip.length (no tiling needed)
    });

    // Should not call duplicate_clip_to_arrangement
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "789" });
  });

  it("should tile clip with pre-roll (start_marker < loop_start) with correct offsets", () => {
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, ["789", "1000", "1001", "1002"]);

    mockLiveApiGet({
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        looping: 1,
        start_time: 0.0,
        end_time: 3.0, // 3 beats currently visible
        loop_start: 1.0, // start at beat 2 (1|2)
        loop_end: 4.0, // 3 beats of loop content
        start_marker: 0.0, // firstStart at beat 1 (1|1) - creates 1 beat pre-roll
        end_marker: 4.0,
        signature_numerator: 4,
        signature_denominator: 4,
        trackIndex,
      },
      LiveSet: {
        tracks: ["id", 0],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      "live_set tracks 0": {
        arrangement_clips: ["id", 789],
      },
    });

    // Track created clips and their start_marker values
    let nextId = 1000;

    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        const id = nextId++;

        return `id ${id}`;
      }
    });

    // Track set() calls on created clips
    const setCallsByClip = {};

    liveApiSet.mockImplementation(function (prop, value) {
      const clipId = this._id;

      if (!setCallsByClip[clipId]) {
        setCallsByClip[clipId] = {};
      }

      setCallsByClip[clipId][prop] = value;
    });

    const result = updateClip({
      ids: "789",
      arrangementLength: "3:0", // 12 beats total - needs 3 tiles after original
    });

    // Should create 3 tiles
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      3.0, // First tile at beat 3
    );
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      6.0, // Second tile at beat 6
    );
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      9.0, // Third tile at beat 9
    );

    // Verify start_marker offsets account for pre-roll
    // currentOffset = start_marker - loop_start = 0 - 1 = -1
    // Tile 0: startOffset = currentOffset + currentArrangementLength = -1 + 3 = 2
    //         tileStartMarker = loop_start + (2 % clipLength) = 1 + (2 % 3) = 1 + 2 = 3
    // Tile 1: startOffset = 2 + 3 = 5
    //         tileStartMarker = loop_start + (5 % clipLength) = 1 + (5 % 3) = 1 + 2 = 3
    // Tile 2: startOffset = 5 + 3 = 8
    //         tileStartMarker = loop_start + (8 % clipLength) = 1 + (8 % 3) = 1 + 2 = 3
    expect(setCallsByClip["1000"].start_marker).toBe(3.0);
    expect(setCallsByClip["1001"].start_marker).toBe(3.0);
    expect(setCallsByClip["1002"].start_marker).toBe(3.0);

    expect(result).toStrictEqual([
      { id: "789" },
      { id: "1000" },
      { id: "1001" },
      { id: "1002" },
    ]);
  });

  it("should preserve envelopes when tiling clip with hidden content", () => {
    const trackIndex = 0;

    // Override liveApiId for this test to handle new clip IDs
    liveApiId.mockImplementation(function () {
      if (this._path === "id 1000" || this._id === "1000") {
        return "1000";
      }

      if (this._path === "id 1001" || this._id === "1001") {
        return "1001";
      }

      return this._id;
    });

    setupArrangementClipPath(
      trackIndex,
      (id) =>
        id === "789" ||
        id === "1000" ||
        id === 1000 ||
        id === "1001" ||
        id === 1001,
    );

    mockLiveApiGet({
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 1, // This is a looped clip
        start_time: 0.0,
        end_time: 4.0, // Currently showing 4 beats
        loop_start: 0.0,
        loop_end: 8.0, // clip.length = 8 beats (has hidden content)
        start_marker: 2.0, // Pre-roll: starts at beat 2 but playback from beat 0
        end_marker: 8.0,
        name: "Test Clip",
        trackIndex,
      },
      1000: { end_time: 8.0, start_marker: 2.0, loop_start: 0.0 }, // First full tile (4 beats)
      1001: { end_time: 12.0, start_marker: 2.0, loop_start: 0.0 }, // Second full tile (4 beats)
      LiveSet: {
        tracks: ["id", 0],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      "live_set tracks 0": {
        arrangement_clips: ["id", 789],
      },
    });

    // Mock duplicate_clip_to_arrangement calls for tiling
    let callCount = 0;

    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;

        if (callCount === 1) {
          return `id 1000`; // First full tile (4 beats)
        } else if (callCount === 2) {
          return `id 1001`; // Second full tile (4 beats)
        }
      }
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: "789",
        arrangementLength: "3:0", // 12 beats
      },
      mockContext,
    );

    // Should tile using arrangement length (4 beats) for spacing
    // Keeps original clip and tiles after it
    // Creates 2 full tiles at positions 4 and 8 (8 beats total, tiled at 4-beat intervals)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      4.0,
    );
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      8.0,
    );

    // Should NOT emit envelope warning (preserves envelopes via non-destructive tiling)
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Automation envelopes were lost"),
    );

    consoleErrorSpy.mockRestore();

    // Should return original + 2 full tiles (4 beats each)
    expect(result).toStrictEqual([
      { id: "789" },
      { id: "1000" },
      { id: "1001" },
    ]);
  });
});
