import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import {
  setupLoopedClipSlicingMocks,
  setupSlicingClipBaseMocks,
  setupSlicingClipGetMock,
} from "#src/tools/operations/transform-clips/tests/transform-clips-slicing-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - slicing", () => {
  beforeEach(() => {
    // Reset mocks before each test
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should slice looped clips and tile to original length", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    updateClip(
      {
        ids: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
      },
      { holdingAreaStartBeats: 40000 },
    );

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

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, {
      looping: true,
      endTime: 2.0,
      loopEnd: 2.0,
    });

    updateClip(
      {
        ids: clipId,
        slice: "1:0.0", // 1 bar = 4 beats (larger than clip)
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should not create temp clips or tiles
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("should warn when slice is used with non-arrangement clips", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId, {
      path: "live_set tracks 0 clip_slots 0 clip",
    });
    // Override to be a session clip
    liveApiGet.mockImplementation(function (
      this: MockLiveAPIContext,
      prop: string,
    ) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      if (this._id === clipId) {
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];
        if (prop === "is_arrangement_clip") return [0]; // Session clip
      }

      return [0];
    });

    updateClip(
      {
        ids: clipId,
        slice: "1:0.0",
      },
      { holdingAreaStartBeats: 40000 },
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("slice requires arrangement clips"),
    );
  });

  it("should throw error when slice is <= 0", () => {
    const clipId = "clip_1";

    setupSlicingClipBaseMocks(clipId);
    setupSlicingClipGetMock(clipId, { looping: true });

    expect(() =>
      updateClip(
        {
          ids: clipId,
          slice: "0:0.0",
        },
        { holdingAreaStartBeats: 40000 },
      ),
    ).toThrow("slice must be greater than 0");
  });

  it("should apply other updates after slicing", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    updateClip(
      {
        ids: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
        name: "Sliced Clip",
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should create temp clip for slicing
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
});
