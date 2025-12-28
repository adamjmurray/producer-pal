import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { mockContext } from "../helpers/update-clip-test-helpers.js";
import { updateClip } from "../update-clip.js";

describe("arrangementLength (unlooped MIDI clips expansion with tiling)", () => {
  it("should tile unlooped clip with chunks matching current arrangement length", () => {
    const trackIndex = 0;
    const clipId = "800";
    let tileCount = 0;
    // 5 IDs needed: 3 full tiles (direct) + 1 partial tile (holding + move = 2 calls)
    const tileIds = ["801", "802", "803", "804", "805"];

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || tileIds.includes(this._id)) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }
      if (this._path === "live_set") {
        return "live_set";
      }
      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }
      return this._path;
    });

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0,
        start_time: 0.0,
        end_time: 3.0, // 3 beats visible
        start_marker: 0.0,
        end_marker: 3.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Test Clip",
        trackIndex,
      },
      ...Object.fromEntries(
        tileIds.map((id) => [
          id,
          {
            start_time: 3.0,
            end_time: 6.0,
            start_marker: 0.0,
            end_marker: 3.0,
          },
        ]),
      ),
      LiveSet: {
        tracks: ["id", trackIndex],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      [`live_set tracks ${trackIndex}`]: {
        arrangement_clips: ["id", clipId],
      },
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileIds[tileCount++]}`;
      }
      return undefined;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: clipId,
        arrangementLength: "3:2", // 14 beats (3.5 bars)
      },
      mockContext,
    );

    consoleErrorSpy.mockRestore();

    // Original clip should have end_marker extended to target
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      14.0,
    );

    // First tile should have markers 3-6 (tileSize = 3)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "801" }),
      "start_marker",
      3.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "801" }),
      "end_marker",
      6.0,
    );

    // Should create 4 tiles: 3-6, 6-9, 9-12, 12-14
    // 5 duplicate_clip_to_arrangement calls: 3 direct + 2 for partial (holding + move)
    expect(tileCount).toBe(5);

    // Should return original + all tiles
    // Note: 804 is consumed by holding area, 805 is the final partial tile
    expect(result).toEqual([
      { id: clipId },
      { id: "801" },
      { id: "802" },
      { id: "803" },
      { id: "805" },
    ]);
  });

  it("should tile from shorter visible region with appropriate chunk size", () => {
    const trackIndex = 0;
    const clipId = "810";
    let tileCount = 0;
    const tileIds = ["811", "812", "813", "814", "815", "816"];

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || tileIds.includes(this._id)) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }
      if (this._path === "live_set") {
        return "live_set";
      }
      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }
      return this._path;
    });

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0,
        start_time: 0.0,
        end_time: 2.0, // 2 beats visible
        start_marker: 0.0,
        end_marker: 2.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Test Clip",
        trackIndex,
      },
      ...Object.fromEntries(
        tileIds.map((id) => [
          id,
          {
            start_time: 2.0,
            end_time: 4.0,
            start_marker: 0.0,
            end_marker: 2.0,
          },
        ]),
      ),
      LiveSet: {
        tracks: ["id", trackIndex],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      [`live_set tracks ${trackIndex}`]: {
        arrangement_clips: ["id", clipId],
      },
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileIds[tileCount++]}`;
      }
      return undefined;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: clipId,
        arrangementLength: "3:2", // 14 beats
      },
      mockContext,
    );

    consoleErrorSpy.mockRestore();

    // First tile should have markers 2-4 (tileSize = 2)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "811" }),
      "start_marker",
      2.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "811" }),
      "end_marker",
      4.0,
    );

    // Should create 6 tiles: 2-4, 4-6, 6-8, 8-10, 10-12, 12-14
    expect(tileCount).toBe(6);

    // Should return original + all tiles
    expect(result.length).toBe(7);
    expect(result[0]).toEqual({ id: clipId });
  });

  it("should handle start_marker offset correctly when tiling", () => {
    const trackIndex = 0;
    const clipId = "820";
    let tileCount = 0;
    // 5 IDs needed: 3 full tiles (direct) + 1 partial tile (holding + move = 2 calls)
    const tileIds = ["821", "822", "823", "824", "825"];

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || tileIds.includes(this._id)) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }
      if (this._path === "live_set") {
        return "live_set";
      }
      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }
      return this._path;
    });

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0,
        start_time: 0.0,
        end_time: 3.0, // 3 beats visible
        start_marker: 1.0, // Content starts at beat 1
        end_marker: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Test Clip with offset",
        trackIndex,
      },
      ...Object.fromEntries(
        tileIds.map((id) => [
          id,
          {
            start_time: 3.0,
            end_time: 6.0,
            start_marker: 1.0,
            end_marker: 4.0,
          },
        ]),
      ),
      LiveSet: {
        tracks: ["id", trackIndex],
        signature_numerator: 4,
        signature_denominator: 4,
      },
      [`live_set tracks ${trackIndex}`]: {
        arrangement_clips: ["id", clipId],
      },
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileIds[tileCount++]}`;
      }
      return undefined;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: clipId,
        arrangementLength: "3:2", // 14 beats
      },
      mockContext,
    );

    consoleErrorSpy.mockRestore();

    // Target end marker = 1.0 + 14 = 15.0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      15.0,
    );

    // First tile should start at 4.0 (clipStartMarker 1 + currentArrangementLength 3)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "821" }),
      "start_marker",
      4.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "821" }),
      "end_marker",
      7.0, // 4.0 + tileSize (3)
    );

    // Should create 4 tiles: 4-7, 7-10, 10-13, 13-15
    // 5 duplicate_clip_to_arrangement calls: 3 direct + 2 for partial (holding + move)
    expect(tileCount).toBe(5);

    // Should return original + all tiles
    // Note: 824 is consumed by holding area, 825 is the final partial tile
    expect(result.length).toBe(5);
    expect(result[0]).toEqual({ id: clipId });
    expect(result[4]).toEqual({ id: "825" });
  });
});
