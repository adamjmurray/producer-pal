// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Smoke tests for update-clip splitting integration.
 * Comprehensive splitting tests are in arrangement-splitting.test.ts
 */
import { describe, expect, it } from "vitest";
import type { RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { setupClipSplittingMocks } from "#src/tools/shared/arrangement/tests/arrangement-splitting-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

function expectDuplicateCalled(trackMock: RegisteredMockObject): void {
  expect(trackMock.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.any(String),
    expect.any(Number),
  );
}

describe("updateClip - splitting smoke tests", () => {
  it("should call splitting helpers when split parameter is provided", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip(
      {
        ids: clipId,
        split: "2|1, 3|1", // Split at bar 2 and bar 3
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should call duplicate_clip_to_arrangement (splitting is active)
    expectDuplicateCalled(callState.trackMock);
  });

  it("should apply other updates after splitting", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip(
      {
        ids: clipId,
        split: "2|1",
        name: "Split Clip",
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should call duplicate_clip_to_arrangement (splitting is active)
    expectDuplicateCalled(callState.trackMock);
  });
});
