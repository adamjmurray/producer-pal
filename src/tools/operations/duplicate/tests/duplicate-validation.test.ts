// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

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
    mockNonExistentObjects();
    expect(() => duplicate({ type: "track", id: "nonexistent" })).toThrow(
      'duplicate failed: id "nonexistent" does not exist',
    );
  });

  it("should throw an error when track has arrangement params", () => {
    registerMockObject("track1", { path: livePath.track(0) });
    expect(() =>
      duplicate({
        type: "track",
        id: "track1",
        arrangementStart: "1|1|1",
      }),
    ).toThrow("duplicate failed: tracks cannot be duplicated to arrangement");
  });

  it("should allow type 'track' without arrangement params", () => {
    registerMockObject("track1", { path: livePath.track(0) });
    expect(() => duplicate({ type: "track", id: "track1" })).not.toThrow();
  });
});

describe("duplicate - clip session validation", () => {
  it("should throw an error when toSlot is empty for session clip", () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });

    expect(() =>
      duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "  ",
      }),
    ).toThrow("duplicate failed: toSlot is required for session clips");
  });
});

describe("duplicate - return format", () => {
  it("should return single object format when count=1", () => {
    registerMockObject("track1", { path: livePath.track(0) });

    const result = duplicate({ type: "track", id: "track1", count: 1 });

    expect(result).toStrictEqual({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: [],
    });
  });

  it("should return objects array format when count>1", () => {
    registerMockObject("track1", { path: livePath.track(0) });

    const result = duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toMatchObject([
      expect.objectContaining({ trackIndex: expect.any(Number) }),
      expect.objectContaining({ trackIndex: expect.any(Number) }),
    ]);
  });
});

describe("duplicate - track/scene index validation", () => {
  it("should throw when track index cannot be determined", () => {
    registerMockObject("track1", {
      path: "live_set some_other_path",
      type: "Track",
    });

    expect(() => duplicate({ type: "track", id: "track1" })).toThrow(
      'duplicate failed: no track index for id "track1"',
    );
  });

  describe("scene index validation", () => {
    beforeEach(() => {
      registerMockObject("scene1", {
        path: "live_set some_other_path",
        type: "Scene",
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
          arrangementStart: "1|1",
        }),
      ).toThrow('duplicate failed: no scene index for id "scene1"');
    });
  });
});
