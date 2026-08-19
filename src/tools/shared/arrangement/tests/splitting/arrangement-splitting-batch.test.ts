// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The batch loop itself: every call site in src/ passes one clip, so nothing
// else here proves that a second one is split, skipped on the deadline, or
// rescanned.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  mockArrangementClipsRescan,
  setupClipSplittingMocks,
  setupSplittingClipGetMock,
  withEachLiveCallCostingASecond,
  type SplittingCallState,
} from "../helpers/arrangement-splitting-test-helpers.ts";

const HOLDING_AREA = { holdingAreaStartBeats: 40000 } as const;

/**
 * Two 16-beat clips on track 0, at beats 0 and 32. Split points [8, 40] give
 * each exactly one cut — the other point falls outside that clip — so no clip
 * reaches the per-segment deadline check and the batch loop is what's under
 * test.
 * @returns Call-tracking state and the two performSplitting clip arguments
 */
function setupBatchSplitTest(): {
  callState: SplittingCallState;
  arrangementClips: LiveAPI[];
  clips: LiveAPI[];
} {
  const { callState } = setupClipSplittingMocks("clip_1", { endTime: 16.0 });

  // Well past the duplicates the call mock registers at arrangement_clips 1.
  registerMockObject("clip_2", {
    path: livePath.track(0).arrangementClip(5),
    type: "Clip",
    properties: { track_index: 0 },
  });
  setupSplittingClipGetMock("clip_2", { startTime: 32.0, endTime: 48.0 });

  const arrangementClips = [
    LiveAPI.from("id clip_1"),
    LiveAPI.from("id clip_2"),
  ];

  return { callState, arrangementClips, clips: [...arrangementClips] };
}

describe("performSplitting across a batch of clips", () => {
  it("splits every clip, not just the first", () => {
    const { callState, arrangementClips, clips } = setupBatchSplitTest();

    performSplitting(
      arrangementClips,
      [8, 40],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    // Each clip's own copy to the holding area: the first thing its split does.
    expect(callState.trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip_1",
      40000,
    );
    expect(callState.trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip_2",
      40000,
    );
  });

  it("names the clips left uncut when time runs out between them", () => {
    const { callState, arrangementClips, clips } = setupBatchSplitTest();

    // The budget is gone by the time the first clip is done, so the loop stops
    // before starting the second.
    withEachLiveCallCostingASecond(callState.trackMock, () => {
      performSplitting(
        arrangementClips,
        [8, 40],
        clips,
        { ...HOLDING_AREA, deadline: 1500 },
        ARRANGEMENT_SPLIT_MODE,
      );
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "Ran out of time after splitting 1 of 2 clips. " +
        "Not split: clip_2. Re-run for those ids.",
    );
    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip_2",
      40000,
    );
  });

  it("replaces both clips with the pieces the rescan finds", () => {
    const { callState, arrangementClips, clips } = setupBatchSplitTest();

    mockArrangementClipsRescan(callState.trackMock, [
      ["piece_a", 0],
      ["piece_b", 8],
      ["piece_c", 32],
      ["piece_d", 40],
    ]);

    performSplitting(
      arrangementClips,
      [8, 40],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    // Each range picks up only its own pieces, and each stale clip is replaced
    // where it stood.
    expect(clips.map((clip) => clip.id)).toStrictEqual([
      "piece_a",
      "piece_b",
      "piece_c",
      "piece_d",
    ]);
  });
});
