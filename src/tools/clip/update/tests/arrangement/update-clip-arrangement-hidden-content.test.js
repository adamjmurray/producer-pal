import { describe, expect, it, vi } from "vitest";
import { liveApiCall, mockLiveApiGet } from "#src/test/mock-live-api.js";
import {
  mockContext,
  setupArrangementClipPath,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";

describe("updateClip - arrangementLength (expose hidden content)", () => {
  it("should preserve envelopes by tiling when exposing hidden content", () => {
    const trackIndex = 0;

    setupArrangementClipPath(
      trackIndex,
      (id) => id === "789" || id === 1000 || id === 2000 || id === 3000,
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
        loop_end: 8.0, // clip.length = 8 beats - has hidden content
        start_marker: 0.0,
        end_marker: 8.0,
        name: "Test Clip",
        trackIndex,
      },
      1000: { end_time: 40004.0 }, // Holding clip at holding area (4 beats long, matches source arrangement length)
      1500: {}, // Temp clip for shortening
      2000: { end_time: 6.0, start_marker: 0.0, loop_start: 0.0 }, // Final partial tile at position 4
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
          return `id 1000`; // Holding clip for partial
        } else if (callCount === 2) {
          return `id 2000`; // Final partial tile
        }
      }

      if (method === "create_midi_clip") {
        return `id 1500`; // Temp clip for shortening in holding area
      }
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = updateClip(
      {
        ids: "789",
        arrangementLength: "1:2", // 6 beats
      },
      mockContext,
    );

    // Scenario B: Keep original clip and tile remaining 2 beats after it
    // Should duplicate original clip to holding area (no full tiles since 2 < 4)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      40000,
    );

    // Should create temp clip to shorten holding clip from 4 to 2 beats
    expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 40002, 2);

    // Should duplicate from holding to target position (after original clip at 4.0)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 1000",
      4.0,
    );

    // Should NOT emit envelope warning (non-destructive tiling preserves envelopes)
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Automation envelopes were lost"),
    );

    consoleErrorSpy.mockRestore();

    // Should return original + partial tile
    expect(result).toStrictEqual([{ id: "789" }, { id: "2000" }]);
  });
});
