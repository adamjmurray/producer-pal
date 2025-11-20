import { vi } from "vitest";

// Re-export mock utilities from mock-live-api for convenience
export {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";

// Mock updateClip to avoid complex internal logic
export const updateClipMock = vi.fn(({ ids }) => {
  // Return array format to simulate tiled clips
  return [{ id: ids }];
});

// Mock arrangement-tiling helpers
export const createShortenedClipInHoldingMock = vi.fn(() => ({
  holdingClipId: "holding_clip_id",
}));

export const moveClipFromHoldingMock = vi.fn(
  (_holdingClipId, track, _startBeats) => {
    // Return a mock LiveAPI object with necessary methods
    const clipId = `${track.path} arrangement_clips 0`;
    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") {
          return 1;
        }
        if (prop === "start_time") {
          return _startBeats;
        }
        return null;
      }),
      // Add trackIndex getter for getMinimalClipInfo
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);
        return match ? parseInt(match[1]) : null;
      },
    };
  },
);

// Setup mocks for vi.mock calls
/**
 *
 */
export function setupMocks() {
  vi.mock(import("../clip/update-clip.js"), () => ({
    updateClip: updateClipMock,
  }));

  vi.mock(import("../shared/arrangement-tiling.js"), () => ({
    createShortenedClipInHolding: createShortenedClipInHoldingMock,
    moveClipFromHolding: moveClipFromHoldingMock,
  }));
}
