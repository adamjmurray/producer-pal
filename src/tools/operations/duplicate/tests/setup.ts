// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

// Shared mock setup for duplicate tests
// This file is referenced in each test file's vi.mock() calls
import { vi } from "vitest";

interface MockTrack {
  path: string;
}

/**
 * Mock implementation for updateClip that returns tiled clip array format.
 */
export const updateClipMock = vi.fn(({ ids }: { ids: string }) => [
  { id: ids },
]);

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
