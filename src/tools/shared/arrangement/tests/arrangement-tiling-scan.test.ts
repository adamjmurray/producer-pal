// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireMockTrack } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  mockContext,
  setupMidiSourceClip,
  setupTileClip,
  setupTrackWithQueuedMethods,
} from "./arrangement-tiling-test-helpers.ts";

// Mock the loop-deadline module to control deadline behavior
vi.mock(import("#src/tools/clip/helpers/loop-deadline.ts"), () => ({
  LOOP_DEADLINE_BUFFER_MS: 10000,
  computeLoopDeadline: vi.fn(() => 0),
  isDeadlineExceeded: vi.fn(() => false),
}));

// Dynamic import after mock is set up
const { tileClipToRange } = await import("../arrangement-tiling.ts");
const { isDeadlineExceeded } =
  await import("#src/tools/clip/helpers/loop-deadline.ts");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isDeadlineExceeded).mockReturnValue(false);
});

/**
 * Set up a source clip and a track ready to take `tileCount` tiles.
 *
 * The source is a real arrangement clip sitting just before the tiled span
 * (0..4, tiling starts at 100). Both matter: the crash workaround skips
 * non-arrangement sources without scanning, and a source overlapping the span
 * turns the pre-clear off — either would make the scan counts below vacuous.
 * @param tileCount - How many tiles the run will place
 * @returns The source clip and track mocks
 */
function setupTiling(tileCount: number) {
  const sourceClip = setupMidiSourceClip("100", 0, {
    is_arrangement_clip: 1,
    start_time: 0,
    end_time: 4,
  });
  const track = setupTrackWithQueuedMethods(0, {
    duplicate_clip_to_arrangement: Array.from({ length: tileCount }, (_, i) => [
      "id",
      String(200 + i),
    ]),
  });

  for (let i = 0; i < tileCount; i++) setupTileClip(String(200 + i));

  return { sourceClip, track };
}

/**
 * Tile `tileCount` 4-beat tiles and count the track's arrangement_clips reads.
 * @param tileCount - How many tiles to place
 * @returns Number of arrangement_clips reads
 */
function countTrackScans(tileCount: number): number {
  const { sourceClip, track } = setupTiling(tileCount);

  tileClipToRange(sourceClip, track, 100, tileCount * 4, 1000, mockContext);

  return requireMockTrack(0).get.mock.calls.filter(
    ([property]: unknown[]) => property === "arrangement_clips",
  ).length;
}

describe("tileClipToRange track scanning", () => {
  it("scans the track once for the whole span, not once per tile", () => {
    // The scan builds a LiveAPI per arrangement clip, so one per tile made a
    // long stretch cost O(tiles x clips) object builds and go superlinear.
    expect(countTrackScans(8)).toBe(countTrackScans(2));
  });

  it("scans exactly once", () => {
    expect(countTrackScans(4)).toBe(1);
  });
});

describe("tileClipToRange deadline", () => {
  it("stops placing tiles once the deadline passes", () => {
    const { sourceClip, track } = setupTiling(4);

    // Two tiles land, then time runs out.
    vi.mocked(isDeadlineExceeded)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const result = tileClipToRange(sourceClip, track, 100, 16, 1000, {
      ...mockContext,
      deadline: 1,
    });

    expect(result).toStrictEqual([{ id: "200" }, { id: "201" }]);
  });

  it("reports how far it got so the caller can resume", () => {
    const { sourceClip, track } = setupTiling(4);

    vi.mocked(isDeadlineExceeded)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    tileClipToRange(sourceClip, track, 100, 16, 1000, {
      ...mockContext,
      deadline: 1,
    });

    // A bare "timed out" tells the caller nothing about what landed; the beat
    // position is what makes the partial result actionable.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("placed 1 of 4 tiles, reaching 104 beats"),
    );
  });

  it("places every tile when no deadline is set", () => {
    const { sourceClip, track } = setupTiling(4);

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      16,
      1000,
      mockContext,
    );

    expect(result).toHaveLength(4);
  });
});
