/**
 * Smoke tests for transform-clips slicing integration.
 * Comprehensive slicing tests are in arrangement-slicing.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";
import { setupLoopedClipSlicingMocks } from "#src/tools/shared/arrangement/arrangement-slicing-test-helpers.ts";

describe("transformClips - slicing smoke tests", () => {
  beforeEach(() => {
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should call slicing helpers when slice parameter is provided", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    transformClips(
      {
        clipIds: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should call duplicate_clip_to_arrangement (slicing is active)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should return sliced clips in result", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    const result = transformClips(
      {
        clipIds: clipId,
        slice: "1:0.0",
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should return clip IDs in result
    expect(result.clipIds).toBeDefined();
    expect(Array.isArray(result.clipIds)).toBe(true);
  });
});
