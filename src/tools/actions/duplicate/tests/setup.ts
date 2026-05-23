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
 * Mock implementation for moveClipFromHolding.
 * @param _holdingClipId - Holding clip ID
 * @param track - Track object
 * @param _startBeats - Start position in beats
 */
export const moveClipFromHoldingMock = vi.fn(
  (_holdingClipId: string, track: MockTrack, _startBeats: number) => {
    const clipId = `${track.path} arrangement_clips 0`;

    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      setAll: vi.fn(),
      getProperty: vi.fn((prop: string) => {
        if (prop === "is_arrangement_clip") return 1;
        if (prop === "start_time") return _startBeats;

        return null;
      }),
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);

        return match ? Number.parseInt(match[1] as string) : null;
      },
    };
  },
);
