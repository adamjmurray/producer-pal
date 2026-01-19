import { beforeEach, describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.js";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import {
  liveApiId,
  liveApiPath,
  liveApiType,
  setupSessionClipPath,
  setupTrackPath,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.js";
import type { Mock } from "vitest";

interface MockContext {
  _id?: string;
  _path?: string;
}

describe("duplicate - input validation", () => {
  it("should throw an error when type is missing", () => {
    expect(() =>
      duplicate({ id: "some-id" } as { type: string; id: string }),
    ).toThrow("duplicate failed: type is required");
  });

  it("should throw an error when id is missing", () => {
    expect(() =>
      duplicate({ type: "track" } as { type: string; id: string }),
    ).toThrow("duplicate failed: id is required");
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
    (liveApiId as Mock).mockReturnValue("id 0");
    expect(() => duplicate({ type: "track", id: "nonexistent" })).toThrow(
      'duplicate failed: id "nonexistent" does not exist',
    );
  });

  it("should throw an error when type is 'track' and destination is 'arrangement'", () => {
    (liveApiPath as Mock).mockReturnValue("live_set tracks 0");
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
    (liveApiPath as Mock).mockReturnValue("live_set tracks 0");
    expect(() =>
      duplicate({ type: "track", id: "track1", destination: "session" }),
    ).not.toThrow();
  });

  it("should allow type 'track' without destination parameter", () => {
    (liveApiPath as Mock).mockReturnValue("live_set tracks 0");
    expect(() => duplicate({ type: "track", id: "track1" })).not.toThrow();
  });
});

describe("duplicate - clip session validation", () => {
  it("should throw an error when toTrackIndex is missing for session destination", () => {
    setupSessionClipPath("clip1");

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
    setupSessionClipPath("clip1");

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
    setupSessionClipPath("clip1");

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
    setupTrackPath("track1");

    const result = duplicate({ type: "track", id: "track1", count: 1 });

    expect(result).toStrictEqual({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: [],
    });
  });

  it("should return objects array format when count>1", () => {
    setupTrackPath("track1");

    const result = duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toMatchObject([
      expect.objectContaining({ trackIndex: expect.any(Number) }),
      expect.objectContaining({ trackIndex: expect.any(Number) }),
    ]);
  });
});

describe("duplicate - track/scene index validation", () => {
  it("should throw when track index cannot be determined", () => {
    // Set up a path that doesn't match "tracks N" pattern but returns Track type
    (liveApiPath as Mock).mockImplementation(function (
      this: MockContext,
    ): string | undefined {
      if (this._id === "track1") {
        return "live_set some_other_path";
      }

      return this._path;
    });

    // Mock the type to return Track to pass type validation
    (liveApiType as Mock).mockImplementation(function (
      this: MockContext,
    ): string | undefined {
      if (this._id === "track1") {
        return "Track";
      }
    });

    expect(() => duplicate({ type: "track", id: "track1" })).toThrow(
      'duplicate failed: no track index for id "track1"',
    );
  });

  describe("scene index validation", () => {
    beforeEach(() => {
      // Set up a path that doesn't match "scenes N" pattern but returns Scene type
      (liveApiPath as Mock).mockImplementation(function (
        this: MockContext,
      ): string | undefined {
        if (this._id === "scene1") {
          return "live_set some_other_path";
        }

        return this._path;
      });

      // Mock the type to return Scene to pass type validation
      (liveApiType as Mock).mockImplementation(function (
        this: MockContext,
      ): string | undefined {
        if (this._id === "scene1") {
          return "Scene";
        }
      });
    });

    it("should throw for session duplication", () => {
      expect(() => duplicate({ type: "scene", id: "scene1" })).toThrow(
        'duplicate failed: no scene index for id "scene1"',
      );
    });

    it("should throw for arrangement duplication", () => {
      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "1|1",
        }),
      ).toThrow('duplicate failed: no scene index for id "scene1"');
    });
  });
});
