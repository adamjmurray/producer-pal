// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireMockTrack } from "#src/test/helpers/mock-registry-test-helpers.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { setArrangementDuplicateCrashWorkaround } from "../arrangement-tiling-workaround.ts";
import {
  createQueuedMethod,
  mockContext,
  setupArrangementClip,
  setupMidiSourceClip,
  setupTileClip,
  setupTrack,
  setupTrackWithQueuedMethods,
} from "./helpers/arrangement-tiling-test-helpers.ts";

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
  clearMockRegistry();

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
  it("scans once per clear window, not once per tile", () => {
    // See clearArrangementRange for why per-placement scanning is the problem.
    expect(countTrackScans(8)).toBe(1);
    expect(countTrackScans(16)).toBe(2);
  });

  it("scans exactly once", () => {
    expect(countTrackScans(4)).toBe(1);
  });

  it("clears nothing when the crash workaround is off", () => {
    // The flag is the escape hatch for checking whether Ableton fixed the crash.
    // With it off, per-tile clearing is a no-op, so a wide clear would delete
    // clips Live is happy to overwrite itself.
    setArrangementDuplicateCrashWorkaround(false);

    try {
      expect(countTrackScans(4)).toBe(0);
    } finally {
      setArrangementDuplicateCrashWorkaround(true);
    }
  });
});

/**
 * Report the deadline as passed once tiling has asked `checks` times.
 * Tiling asks on entry and then at each clear-window boundary.
 * @param checks - How many checks answer "still time"
 */
function stopAfterChecks(checks: number): void {
  let asked = 0;

  vi.mocked(isDeadlineExceeded).mockImplementation(() => asked++ >= checks);
}

describe("tileClipToRange deadline", () => {
  it("stops placing tiles once the deadline passes", () => {
    // 16 tiles is two clear windows; entry and each window boundary check.
    const { sourceClip, track } = setupTiling(16);

    stopAfterChecks(2);

    const result = tileClipToRange(sourceClip, track, 100, 64, 1000, {
      ...mockContext,
      deadline: 1,
    });

    expect(result).toHaveLength(8);
  });

  it("reports how far it got so the caller can resume", () => {
    const { sourceClip, track } = setupTiling(16);

    stopAfterChecks(2);

    tileClipToRange(sourceClip, track, 100, 64, 1000, {
      ...mockContext,
      deadline: 1,
    });

    // A bare "timed out" tells the caller nothing about what landed; the beat
    // position is what makes the partial result actionable.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("placed 8 of 16 tiles, reaching 132 beats"),
    );
  });

  it("clears nothing when it is already out of time on entry", () => {
    // The clear empties the whole span in one go, so running it and then
    // placing no tiles would leave a hole with nothing to show for it.
    const { sourceClip, track } = setupTiling(4);

    vi.mocked(isDeadlineExceeded).mockReturnValue(true);

    const result = tileClipToRange(sourceClip, track, 100, 16, 1000, {
      ...mockContext,
      deadline: 1,
    });

    expect(result).toStrictEqual([]);
    expect(
      requireMockTrack(0).get.mock.calls.filter(
        ([property]: unknown[]) => property === "arrangement_clips",
      ),
    ).toHaveLength(0);
  });

  it("stops at any tile when it is clearing per tile", () => {
    // Nothing is emptied ahead of the tiles on that path, so stopping mid-window
    // leaves no hole and the deadline can be honoured a tile at a time.
    setArrangementDuplicateCrashWorkaround(false);

    try {
      const { sourceClip, track } = setupTiling(4);

      stopAfterChecks(3);

      const result = tileClipToRange(sourceClip, track, 100, 16, 1000, {
        ...mockContext,
        deadline: 1,
      });

      expect(result).toHaveLength(2);
    } finally {
      setArrangementDuplicateCrashWorkaround(true);
    }
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

/**
 * Tiling onto a track that already holds a clip deep inside the span.
 * @param tileCount - How many tiles the run will place
 * @param obstacleStart - Where the existing clip starts, in beats
 * @returns The source clip and track
 */
function setupTilingOverExistingClip(tileCount: number, obstacleStart: number) {
  clearMockRegistry();

  const sourceClip = setupMidiSourceClip("100", 0, {
    is_arrangement_clip: 1,
    start_time: 0,
    end_time: 4,
  });

  setupTrack(0, {
    properties: { arrangement_clips: ["id", "100", "id", "700"] },
    methods: {
      duplicate_clip_to_arrangement: createQueuedMethod(
        Array.from({ length: tileCount }, (_, i) => ["id", String(200 + i)]),
      ),
      delete_clip: () => null,
    },
  });

  setupArrangementClip(
    "700",
    0,
    { start_time: obstacleStart, end_time: obstacleStart + 4 },
    1,
  );

  for (let i = 0; i < tileCount; i++) setupTileClip(String(200 + i));

  return { sourceClip, track: LiveAPI.from(livePath.track(0)) };
}

describe("tileClipToRange clearing ahead", () => {
  // Clearing empties a span before anything refills it, so clearing the whole
  // span up front and then stopping on the deadline would delete this clip and
  // leave a hole where its replacement tiles should have gone.
  it("leaves a clip past the deadline stop untouched", () => {
    const { sourceClip, track } = setupTilingOverExistingClip(16, 140);

    stopAfterChecks(2);

    const result = tileClipToRange(sourceClip, track, 100, 64, 1000, {
      ...mockContext,
      deadline: 1,
    });

    expect(requireMockTrack(0).call).not.toHaveBeenCalledWith(
      "delete_clip",
      "id 700",
    );
    expect(result).toHaveLength(8);
  });

  it("clears that same clip once tiling reaches it", () => {
    const { sourceClip, track } = setupTilingOverExistingClip(16, 140);

    tileClipToRange(sourceClip, track, 100, 64, 1000, mockContext);

    expect(requireMockTrack(0).call).toHaveBeenCalledWith(
      "delete_clip",
      "id 700",
    );
  });
});
