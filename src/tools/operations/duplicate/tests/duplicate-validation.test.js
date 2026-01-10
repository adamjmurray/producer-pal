import { describe, expect, it, vi } from "vitest";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import {
  liveApiId,
  liveApiPath,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.js";

// [duplicate-validation] updateClip mock for validation tests
vi.mock(import("#src/tools/clip/update/update-clip.js"), () => ({
  updateClip: vi.fn((config) => [{ id: config.ids }]),
}));

// [duplicate-validation] arrangement-tiling mocks
vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.js"), () => ({
  createShortenedClipInHolding: vi
    .fn()
    .mockImplementation(() => ({ holdingClipId: "holding_clip_id" })),
  moveClipFromHolding: vi.fn((_holdClipId, trk, startBeat) => {
    const arrangementPath = `${trk.path} arrangement_clips 0`;

    return {
      id: arrangementPath,
      path: arrangementPath,
      set: vi.fn(),
      getProperty: vi.fn((key) => {
        if (key === "is_arrangement_clip") return 1;
        if (key === "start_time") return startBeat;

        return null;
      }),
      get trackIndex() {
        const found = arrangementPath.match(/tracks (\d+)/);

        return found ? Number.parseInt(found[1]) : null;
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

  it("should throw an error when type is 'track' and destination is 'arrangement'", () => {
    liveApiPath.mockReturnValue("live_set tracks 0");
    expect(() =>
      duplicate({
        type: "track",
        id: "track1",
        destination: "arrangement",
        arrangementStart: "1|1|1",
      }),
    ).toThrow(
      "duplicate failed: tracks cannot be duplicated to arrangement (use destination='session' or omit destination parameter)",
    );
  });

  it("should allow type 'track' with destination 'session'", () => {
    liveApiPath.mockReturnValue("live_set tracks 0");
    expect(() =>
      duplicate({ type: "track", id: "track1", destination: "session" }),
    ).not.toThrow();
  });

  it("should allow type 'track' without destination parameter", () => {
    liveApiPath.mockReturnValue("live_set tracks 0");
    expect(() => duplicate({ type: "track", id: "track1" })).not.toThrow();
  });
});

describe("duplicate - clip session validation", () => {
  it("should throw an error when toTrackIndex is missing for session destination", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") return "live_set tracks 0 clip_slots 0 clip";

      return this._path;
    });

    expect(() =>
      duplicate({
        type: "clip",
        id: "clip1",
        destination: "session",
        toSceneIndex: "0",
      }),
    ).toThrow("duplicate failed: toTrackIndex is required for session clips");
  });

  it("should throw an error when toSceneIndex is missing for session destination", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") return "live_set tracks 0 clip_slots 0 clip";

      return this._path;
    });

    expect(() =>
      duplicate({
        type: "clip",
        id: "clip1",
        destination: "session",
        toTrackIndex: 0,
      }),
    ).toThrow("duplicate failed: toSceneIndex is required for session clips");
  });

  it("should throw an error when toSceneIndex is empty for session destination", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") return "live_set tracks 0 clip_slots 0 clip";

      return this._path;
    });

    expect(() =>
      duplicate({
        type: "clip",
        id: "clip1",
        destination: "session",
        toTrackIndex: 0,
        toSceneIndex: "  ",
      }),
    ).toThrow("duplicate failed: toSceneIndex is required for session clips");
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
