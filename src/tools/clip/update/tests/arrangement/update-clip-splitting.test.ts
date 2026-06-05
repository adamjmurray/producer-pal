// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Smoke tests for update-clip splitting integration.
 * Comprehensive splitting tests are in arrangement-splitting.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
  lookupMockObject,
  clearMockRegistry,
} from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  createSplittingCallMock,
  setupClipSplittingMocks,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
} from "#src/tools/shared/arrangement/tests/arrangement-splitting-test-helpers.ts";
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

  it("should filter out non-existent clips after splitting", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    // Register fresh clips that rescanSplitClips will find.
    // One valid clip and one that will be non-existent (id "0").
    const freshClipId = "fresh_clip";

    registerMockObject(freshClipId, {
      path: livePath.track(0).arrangementClip(2),
      type: "Clip",
      properties: {
        start_time: 0.0,
        is_midi_clip: 1,
        is_audio_clip: 0,
        is_arrangement_clip: 1,
      },
    });

    // Set up track mock to return arrangement clips including the fresh one
    const trackMock = lookupMockObject("track_0", livePath.track(0));
    const origGet = trackMock!.get.getMockImplementation();

    trackMock!.get.mockImplementation((prop: string) => {
      if (prop === "arrangement_clips") {
        // Return fresh clip + a non-existent clip (id 0)
        return ["id", freshClipId, "id", "0"];
      }

      return origGet ? origGet(prop) : [0];
    });

    const result = await updateClip(
      {
        ids: clipId,
        split: "2|1",
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should complete successfully, filtering out the non-existent clip (id "0")
    expectDuplicateCalled(callState.trackMock);
    const results = Array.isArray(result) ? result : [result];
    const resultIds = results.map((r) => r.id);

    expect(resultIds).not.toContain("0");
  });

  it("should warn and skip splitting for a take-lane clip", async () => {
    const clipId = "take_lane_clip";
    const consoleSpy = vi.spyOn(console, "warn");

    // A take-lane arrangement clip cannot be split via
    // duplicate_clip_to_arrangement, so it is warned-and-skipped.
    clearMockRegistry();
    setupSplittingClipBaseMocks(clipId, {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
    });
    setupSplittingClipGetMock(clipId);
    createSplittingCallMock();

    const result = await updateClip(
      {
        ids: clipId,
        split: "2|1",
      },
      { holdingAreaStartBeats: 40000 },
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("split parameter ignored for take-lane clip"),
    );
    const results = Array.isArray(result) ? result : [result];

    expect(results.map((r) => r.id)).toContain(clipId);
  });
});
