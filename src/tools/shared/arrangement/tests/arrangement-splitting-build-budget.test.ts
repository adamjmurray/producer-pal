// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for cutting several clips on one track.
//
// The holding area used to be rescanned per clip, and a rescan builds every
// arrangement clip on the track. Cutting one track at N points therefore cost
// O(N^2) objects: 40 clips at 32 points built 2154 against real Live, 170 of
// them distinct. The scan is once per track now, so the count is linear.
//
// Listing a clip that no split point falls inside is separately free: it costs
// the one object every id costs, and the split never touches it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginLiveApiBuildStats,
  liveApiBuildStats,
} from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  createSplittingCallMock,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
} from "./helpers/arrangement-splitting-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

/** Clips on the track, each 16 beats long, laid end to end from beat 0. */
const CLIPS = 6;
const CLIP_BEATS = 16;
const clipIds = Array.from({ length: CLIPS }, (_, i) => String(101 + i));

/** Register CLIPS arrangement clips on track 0, all reported by the track. */
function setupTrack(): void {
  clearMockRegistry();

  for (const [i, clipId] of clipIds.entries()) {
    setupSplittingClipBaseMocks(clipId, {
      path: livePath.track(0).arrangementClip(i),
    });
    setupSplittingClipGetMock(clipId, {
      startTime: i * CLIP_BEATS,
      endTime: (i + 1) * CLIP_BEATS,
    });
  }

  const callState = createSplittingCallMock();

  // Every clip, in the ["id", <id>, "id", <id>, ...] shape Live reports — a
  // track that under-reports its clips hides the scan this test measures.
  callState.trackMock.properties.arrangement_clips = clipIds.flatMap((id) => [
    "id",
    id,
  ]);
}

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

describe("arrangement splitting build budget", () => {
  beforeEach(setupTrack);

  it("resolves the track once for the whole call, not once per cut", async () => {
    // One point inside every clip.
    const points = clipIds.map((_, i) => `${String(i * 4 + 2)}|1`).join(",");

    await updateClip({ id: clipIds.join(","), arrangementSplit: points }, {});

    // Two, whatever the cut count: once for the splitting itself, once more
    // for the rescan that collects the pieces. Resolving the track is what used
    // to carry the per-clip holding-area scan with it.
    expect(resolves("live_set tracks *")).toBe(2);

    // Three per clip and no more: once for the id the caller listed, once for
    // the single holding-area scan, once for the rescan that collects the
    // pieces. A holding-area scan per clip would make this term quadratic.
    expect(resolves("id *")).toBe(CLIPS * 3);
  });

  it("builds nothing new for a listed clip no point falls inside", async () => {
    // Only the first clip contains 2|1; the rest are listed and never cut.
    await updateClip({ id: clipIds.join(","), arrangementSplit: "2|1" }, {});

    const listingAll = liveApiBuildStats().distinct;

    setupTrack();
    beginLiveApiBuildStats();
    await updateClip({ id: clipIds[0] as string, arrangementSplit: "2|1" }, {});

    // The 5 uncut clips name objects the split's own track scan resolves
    // anyway, so listing them adds repeats and no new object. Measured the
    // same way against real Live: 18 distinct either way.
    expect(listingAll).toBe(liveApiBuildStats().distinct);
  });
});
