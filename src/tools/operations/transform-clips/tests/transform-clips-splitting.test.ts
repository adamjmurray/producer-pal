/**
 * Smoke tests for transform-clips splitting integration.
 * Comprehensive splitting tests are in arrangement-splitting.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";
import { setupLoopedClipSplittingMocks } from "#src/tools/shared/arrangement/arrangement-splitting-test-helpers.ts";

describe("transformClips - splitting smoke tests", () => {
  beforeEach(() => {
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should call splitting helpers when split parameter is provided", () => {
    const clipId = "clip_1";

    setupLoopedClipSplittingMocks(clipId);

    transformClips(
      {
        clipIds: clipId,
        split: "2|1, 3|1", // Split at bar 2 and bar 3
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should call duplicate_clip_to_arrangement (splitting is active)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("should return split clips in result", () => {
    const clipId = "clip_1";

    setupLoopedClipSplittingMocks(clipId);

    const result = transformClips(
      {
        clipIds: clipId,
        split: "2|1",
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should return clip IDs in result
    expect(result.clipIds).toBeDefined();
    expect(Array.isArray(result.clipIds)).toBe(true);
  });
});
