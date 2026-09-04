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
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  createSplittingCallMock,
  setupClipSplittingMocks,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
  type SplittingCallState,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-splitting-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { setupCuePointMocksRegistry } from "#src/test/helpers/cue-point-test-helpers.ts";

function expectDuplicateCalled(trackMock: RegisteredMockObject): void {
  expect(trackMock.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.any(String),
    expect.any(Number),
  );
}

describe("updateClip - splitting smoke tests", () => {
  it("still splits for the deprecated split param", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip({ id: clipId, split: "2|1" }, {});

    expectDuplicateCalled(callState.trackMock);
  });

  it("splits nothing when both split params are given", async () => {
    const clipId = "clip_1";
    const consoleSpy = vi.spyOn(console, "warn");

    const { callState } = setupClipSplittingMocks(clipId);

    // They read positions on different timelines, so there is no safe guess.
    await updateClip({ id: clipId, arrangementSplit: "2|1", split: "3|1" }, {});

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit and split both name split"),
    );
  });

  it("splits for arrangementSplit when split is sent blank", async () => {
    const clipId = "clip_1";
    const consoleSpy = vi.spyOn(console, "warn");

    const { callState } = setupClipSplittingMocks(clipId);

    // A client that fills every optional string with "" is not sending two
    // split requests, so the ambiguity warning would cost it the one it asked
    // for.
    await updateClip({ id: clipId, arrangementSplit: "2|1", split: "" }, {});

    expectDuplicateCalled(callState.trackMock);
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit and split both name split"),
    );
  });

  it("splits nothing, and says nothing, for a blank arrangementSplit", async () => {
    const clipId = "clip_1";
    const consoleSpy = vi.spyOn(console, "warn");

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip({ id: clipId, arrangementSplit: "" }, {});

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
    // Complaining about the format of a param that named nothing sends the
    // model looking for a problem with a value it never meant to send.
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit"),
    );
  });

  it("should call splitting helpers when split parameter is provided", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip(
      {
        id: clipId,
        arrangementSplit: "2|1, 3|1", // Split at bar 2 and bar 3
      },
      {},
    );

    // Should call duplicate_clip_to_arrangement (splitting is active)
    expectDuplicateCalled(callState.trackMock);
  });

  it("should apply other updates after splitting", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip(
      {
        id: clipId,
        arrangementSplit: "2|1",
        name: "Split Clip",
      },
      {},
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
        id: clipId,
        arrangementSplit: "2|1",
      },
      {},
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
        id: clipId,
        arrangementSplit: "2|1",
      },
      {},
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit ignored for take-lane clip"),
    );
    const results = Array.isArray(result) ? result : [result];

    expect(results.map((r) => r.id)).toContain(clipId);
  });

  it("should not warn about split on a take-lane clip when split is not given", async () => {
    const clipId = "take_lane_clip";
    const consoleSpy = vi.spyOn(console, "warn");

    clearMockRegistry();
    setupSplittingClipBaseMocks(clipId, {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
    });
    setupSplittingClipGetMock(clipId);
    createSplittingCallMock();

    await updateClip({ id: clipId, name: "renamed" }, {});

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("ignored for take-lane clip"),
    );
  });
});

const CLIP_ID = "clip_1";

const CUE_POINTS = [
  { id: "cue1", time: 4, name: "Verse" },
  { id: "cue2", time: 16, name: "Chorus" },
];

/**
 * A splittable arrangement clip on a Set that also has locators.
 * @param clipProps - Clip properties passed through to the splitting mocks
 * @returns The call-tracking state for the track
 */
function setupWithLocators(
  clipProps: Record<string, unknown> = {},
): SplittingCallState {
  const { callState } = setupClipSplittingMocks(CLIP_ID, clipProps);

  // Re-registers live_set with the same meter, plus the cue points.
  setupCuePointMocksRegistry({
    cuePoints: CUE_POINTS,
    liveSetProps: { signature_numerator: 4, signature_denominator: 4 },
  });

  return callState;
}

describe("updateClip - loc: song positions", () => {
  it("splits at a locator named on arrangementSplit", async () => {
    const callState = setupWithLocators();

    await updateClip({ id: CLIP_ID, arrangementSplit: "loc:Verse" }, {});

    expect(callState.trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("throws, naming arrangementSplit, when the locator is not found", async () => {
    setupWithLocators();

    await expect(
      updateClip({ id: CLIP_ID, arrangementSplit: "loc:Bridge" }, {}),
    ).rejects.toThrow(
      'no locator found with name "Bridge" for arrangementSplit',
    );
  });

  it("throws, naming arrangementStart, when the locator is not found", async () => {
    setupWithLocators();

    await expect(
      updateClip({ id: CLIP_ID, arrangementStart: "loc:Bridge" }, {}),
    ).rejects.toThrow(
      'no locator found with name "Bridge" for arrangementStart',
    );
  });

  it("does not read loc: on split, which is clip-relative", async () => {
    setupWithLocators();

    await expect(
      updateClip({ id: CLIP_ID, split: "loc:Chorus" }, {}),
    ).resolves.toBeDefined();
  });
});
