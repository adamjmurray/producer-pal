// Shared mock setup for duplicate tests
// This file is referenced in each test file's vi.mock() calls
import { vi } from "vitest";

/**
 * Mock implementation for updateClip that returns tiled clip array format.
 */
export const updateClipMock = vi.fn(({ ids }) => [{ id: ids }]);

/**
 * Mock implementation for createShortenedClipInHolding.
 */
export const createShortenedClipInHoldingMock = vi.fn(() => ({
  holdingClipId: "holding_clip_id",
}));

/**
 * Mock implementation for moveClipFromHolding.
 * @param {string} _holdingClipId
 * @param {object} track
 * @param {number} _startBeats
 */
export const moveClipFromHoldingMock = vi.fn(
  (_holdingClipId, track, _startBeats) => {
    const clipId = `${track.path} arrangement_clips 0`;

    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") return 1;
        if (prop === "start_time") return _startBeats;

        return null;
      }),
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);

        return match ? Number.parseInt(/** @type {string} */ (match[1])) : null;
      },
    };
  },
);
