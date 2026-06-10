// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared mock setup for duplicate tests
// This file is referenced in each test file's vi.mock() calls
import { vi } from "vitest";

interface MockTrack {
  path: string;
}

interface MockClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
}

/**
 * Mock implementation for updateClip that returns tiled clip array format.
 * The real updateClip is async, so the default returns a Promise — this keeps
 * the mock faithful and ensures a missing `await` in a caller (e.g. the
 * arrangement-length lengthen path) surfaces as a test failure. Tests may still
 * override with a sync array/object; awaiting callers handle both.
 */
export const updateClipMock = vi.fn(
  ({
    ids,
  }: {
    ids: string;
  }):
    | Promise<MockClipResult | MockClipResult[]>
    | MockClipResult
    | MockClipResult[] => Promise.resolve([{ id: ids }]),
);

/**
 * Mock implementation for createShortenedClipInHolding.
 */
export const createShortenedClipInHoldingMock = vi.fn(() => ({
  holdingClipId: "holding_clip_id",
}));

/**
 * Build a fake placed arrangement clip on a track at a position. Shared by the
 * moveClipFromHolding and duplicateSelfOverlappingClip mocks.
 * @param trackPath - Track path (derives the clip id/path and trackIndex)
 * @param startBeats - Clip start position in beats
 * @returns Fake LiveAPI-like arrangement clip
 */
function makeArrangementClipMock(trackPath: string, startBeats: number) {
  const clipId = `${trackPath} arrangement_clips 0`;

  return {
    id: clipId,
    path: clipId,
    exists: () => true,
    set: vi.fn(),
    setAll: vi.fn(),
    getProperty: vi.fn((prop: string) => {
      if (prop === "is_arrangement_clip") return 1;
      if (prop === "start_time") return startBeats;

      return null;
    }),
    get trackIndex() {
      const match = clipId.match(/tracks (\d+)/);

      return match ? Number.parseInt(match[1] as string) : null;
    },
  };
}

/**
 * Mock implementation for moveClipFromHolding.
 * @param _holdingClipId - Holding clip ID
 * @param track - Track object
 * @param startBeats - Start position in beats
 */
export const moveClipFromHoldingMock = vi.fn(
  (_holdingClipId: string, track: MockTrack, startBeats: number) =>
    makeArrangementClipMock(track.path, startBeats),
);

/**
 * Mock implementation for clearClipAtDuplicateTarget. Defaults to "safe" (true);
 * override with mockReturnValueOnce(false) to drive the self-overlap path.
 */
export const clearClipAtDuplicateTargetMock = vi.fn(() => true);

/**
 * Mock implementation for duplicateSelfOverlappingClip. Returns a fake full copy
 * placed at the target position (arg 2).
 * @param track - Track object (arg 0)
 * @param _sourceClipId - Source clip ID (arg 1)
 * @param targetBeats - Target position in beats (arg 2)
 */
export const duplicateSelfOverlappingClipMock = vi.fn(
  (track: MockTrack, _sourceClipId: string, targetBeats: number) =>
    makeArrangementClipMock(track.path, targetBeats),
);
