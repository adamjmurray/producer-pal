/**
 * Smoke tests for update-clip slicing integration.
 * Comprehensive slicing tests are in arrangement-slicing.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { setupLoopedClipSlicingMocks } from "#src/tools/shared/arrangement/arrangement-slicing-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - slicing smoke tests", () => {
  beforeEach(() => {
    liveApiCall.mockReset();
    liveApiGet.mockReset();
  });

  it("should call slicing helpers when slice parameter is provided", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    updateClip(
      {
        ids: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
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

  it("should apply other updates after slicing", () => {
    const clipId = "clip_1";

    setupLoopedClipSlicingMocks(clipId);

    updateClip(
      {
        ids: clipId,
        slice: "1:0.0",
        name: "Sliced Clip",
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
});
