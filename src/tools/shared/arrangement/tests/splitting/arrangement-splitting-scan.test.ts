// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  setupClipSplittingMocks,
  SPLIT_CLIP_ID,
} from "../helpers/arrangement-splitting-test-helpers.ts";

/**
 * Make every clip the split creates look like a real arrangement clip.
 *
 * The shared helper registers duplicates without `is_arrangement_clip`, and the
 * crash workaround bails out before scanning on anything that isn't one — so
 * without this the scan under test never runs and the assertion passes either
 * way.
 * @param trackMock - The track mock whose duplicates should be registered
 */
function registerDuplicatesAsArrangementClips(
  trackMock: RegisteredMockObject,
): void {
  let count = 0;

  trackMock.call.mockImplementation((method: string) => {
    if (
      method !== "duplicate_clip_to_arrangement" &&
      method !== "create_midi_clip"
    ) {
      return undefined;
    }

    count++;
    const id = `dup_${count}`;

    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(1),
      type: "Clip",
      // In the holding area, not over the segment targets: a clip that overlaps
      // its own target makes the workaround bail before it ever scans.
      properties: {
        is_arrangement_clip: 1,
        start_time: 40000,
        end_time: 40016,
      },
    });

    return ["id", id];
  });
}

/**
 * Split one 16-beat clip and count the track's arrangement_clips reads.
 * @param splitPoints - Beat offsets from the clip start
 * @returns Number of arrangement_clips reads
 */
function countTrackScans(splitPoints: number[]): number {
  const { callState } = setupClipSplittingMocks(SPLIT_CLIP_ID, {
    endTime: 16.0,
  });

  registerDuplicatesAsArrangementClips(callState.trackMock);

  const mockClip = LiveAPI.from(`id ${SPLIT_CLIP_ID}`);

  performSplitting(
    [mockClip],
    splitPoints,
    [mockClip],
    {
      holdingAreaStartBeats: 40000,
    },
    ARRANGEMENT_SPLIT_MODE,
  );

  return callState.trackMock.get.mock.calls.filter(
    ([property]: unknown[]) => property === "arrangement_clips",
  ).length;
}

describe("performSplitting track scanning", () => {
  it("does not scan the track once per segment", () => {
    // Segments land in the span the right-trim just vacated, so there is
    // nothing to clear and nothing to scan for. See clearArrangementRange for
    // why the per-segment scan was the freeze.
    const twoSegments = countTrackScans([8]);
    const eightSegments = countTrackScans([2, 4, 6, 8, 10, 12, 14]);

    expect(eightSegments).toBe(twoSegments);
  });

  it("scans only for the post-split rescan", () => {
    // One read, and it belongs to rescanSplitClips collecting the new clips.
    expect(countTrackScans([4, 8, 12])).toBe(1);
  });

  it("actually performs the split the counts are taken from", () => {
    // Without this, a count of 1 could just mean the split bailed out early and
    // never reached a move at all.
    const { callState } = setupClipSplittingMocks(SPLIT_CLIP_ID, {
      endTime: 16.0,
    });

    registerDuplicatesAsArrangementClips(callState.trackMock);
    performSplitting(
      [LiveAPI.from(`id ${SPLIT_CLIP_ID}`)],
      [4, 8, 12],
      [],
      {
        holdingAreaStartBeats: 40000,
      },
      ARRANGEMENT_SPLIT_MODE,
    );

    const duplicates = callState.trackMock.call.mock.calls.filter(
      ([method]: unknown[]) => method === "duplicate_clip_to_arrangement",
    );

    // One copy to holding, then one per segment moved out of it.
    expect(duplicates.length).toBeGreaterThan(3);
  });
});
