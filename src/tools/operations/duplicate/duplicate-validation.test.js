import { describe, expect, it, vi } from "vitest";
import { duplicate } from "./duplicate.js";
import { liveApiId, liveApiPath } from "./duplicate-test-helpers.js";

// Mock updateClip to avoid complex internal logic
vi.mock(import("../clip/update-clip.js"), () => ({
  updateClip: vi.fn(({ ids }) => {
    // Return array format to simulate tiled clips
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
vi.mock(import("../shared/arrangement/arrangement-tiling.js"), () => ({
  createShortenedClipInHolding: vi.fn(() => ({
    holdingClipId: "holding_clip_id",
  })),
  moveClipFromHolding: vi.fn((_holdingClipId, track, _startBeats) => {
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
  }),
}));

describe("duplicate - input validation", () => {
  it("should throw an error when type is missing", () => {
    expect(() => duplicate({ id: "some-id" })).toThrow(
      "duplicate failed: type is required",
    );
  });

  it("should throw an error when id is missing", () => {
    expect(() => duplicate({ type: "track" })).toThrow(
      "duplicate failed: id is required",
    );
  });

  it("should throw an error when type is invalid", () => {
    expect(() => duplicate({ type: "invalid", id: "some-id" })).toThrow(
      "duplicate failed: type must be one of track, scene, clip",
    );
  });

  it("should throw an error when count is less than 1", () => {
    expect(() => duplicate({ type: "track", id: "some-id", count: 0 })).toThrow(
      "duplicate failed: count must be at least 1",
    );
  });

  it("should throw an error when the object doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => duplicate({ type: "track", id: "nonexistent" })).toThrow(
      'duplicate failed: id "nonexistent" does not exist',
    );
  });
});

describe("duplicate - return format", () => {
  it("should return single object format when count=1", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }
      return this._path;
    });

    const result = duplicate({ type: "track", id: "track1", count: 1 });

    expect(result).toStrictEqual({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: [],
    });
  });

  it("should return objects array format when count>1", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }
      return this._path;
    });

    const result = duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toMatchObject([
      expect.objectContaining({ trackIndex: expect.any(Number) }),
      expect.objectContaining({ trackIndex: expect.any(Number) }),
    ]);
  });
});
