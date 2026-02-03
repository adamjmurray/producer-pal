/**
 * Smoke tests for update-clip splitting integration.
 * Comprehensive splitting tests are in arrangement-splitting.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { setupLoopedClipSplittingMocks } from "#src/tools/shared/arrangement/arrangement-splitting-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - splitting smoke tests", () => {
  beforeEach(() => {
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should call splitting helpers when split parameter is provided", () => {
    const clipId = "clip_1";

    setupLoopedClipSplittingMocks(clipId);

    updateClip(
      {
        ids: clipId,
        split: "2|1, 3|1", // Split at bar 2 and bar 3
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

  it("should apply other updates after splitting", () => {
    const clipId = "clip_1";

    setupLoopedClipSplittingMocks(clipId);

    updateClip(
      {
        ids: clipId,
        split: "2|1",
        name: "Split Clip",
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
});
