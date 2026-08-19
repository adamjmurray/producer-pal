// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  registerSessionClipDuplication,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { registerSessionClipForArrangementDup } from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

describe("duplicate - input validation", () => {
  it("should throw an error when type is missing", async () => {
    await expect(
      duplicate({ id: "some-id" } as { type: string; id: string }),
    ).rejects.toThrow("duplicate failed: type is required");
  });

  it("should throw an error when id is missing", async () => {
    await expect(
      duplicate({ type: "track" } as { type: string; id: string }),
    ).rejects.toThrow("duplicate failed: id is required");
  });

  it("should throw an error when type is invalid", async () => {
    await expect(duplicate({ type: "invalid", id: "some-id" })).rejects.toThrow(
      "duplicate failed: type must be one of track, scene, clip",
    );
  });

  it("should throw an error when count is less than 1", async () => {
    await expect(
      duplicate({ type: "track", id: "some-id", count: 0 }),
    ).rejects.toThrow("duplicate failed: count must be at least 1");
  });

  it("should throw an error when the object doesn't exist", async () => {
    mockNonExistentObjects();
    await expect(
      duplicate({ type: "track", id: "nonexistent" }),
    ).rejects.toThrow('duplicate failed: id "nonexistent" does not exist');
  });

  it("should throw an error when track has arrangement params", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    await expect(
      duplicate({
        type: "track",
        id: "track1",
        arrangementStart: "1|1|1",
      }),
    ).rejects.toThrow(
      "duplicate failed: tracks cannot be duplicated to arrangement",
    );
  });

  it("should allow type 'track' without arrangement params", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    await expect(
      duplicate({ type: "track", id: "track1" }),
    ).resolves.toBeDefined();
  });
});

describe("duplicate - clip session validation", () => {
  it("should throw an error when toSlot is empty for session clip", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        toSlot: ",",
      }),
    ).rejects.toThrow("duplicate failed: toSlot is required for session clips");
  });

  // Every other inapplicable param on this tool warns; these two used to be
  // dropped without a word, so the copy count / length silently didn't happen.
  it("warns that a clip copy ignores count", async () => {
    registerSessionClipDuplication({ destClipProperties: {} });

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0/s1",
      count: 3,
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/1/clip",
      path: "t0/s1",
    });
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("count ignored for clips"),
    );
  });

  it("warns that a session copy ignores arrangementLength", async () => {
    registerSessionClipDuplication({ destClipProperties: {} });

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0/s1",
      arrangementLength: "4bar",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("arrangementLength ignored"),
    );
  });
});

// A caller on the old schema still sends takeLane, and z.coerce.string() turns
// its null into "null" — which used to throw before any copy was made.
describe("duplicate - coerced-null takeLane", () => {
  it.each([
    ["omitted", undefined],
    ["a coerced null", "null"],
    ["a coerced undefined", "undefined"],
  ])(
    "copies to the main lane when takeLane is %s",
    async (_label, takeLane) => {
      const track0 = registerSessionClipForArrangementDup();

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "3|1",
        takeLane,
      });

      expect(track0.call).not.toHaveBeenCalledWith("create_take_lane");
      expect(result).toStrictEqual({
        id: livePath.track(0).arrangementClip(0),
        path: "t0",
        arrangementStart: "3|1",
      });
    },
  );
});

describe("duplicate - return format", () => {
  it("should return single object format when count=1", async () => {
    registerMockObject("track1", { path: livePath.track(0) });

    const result = await duplicate({ type: "track", id: "track1", count: 1 });

    expect(result).toStrictEqual({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: [],
    });
  });

  it("should return objects array format when count>1", async () => {
    registerMockObject("track1", { path: livePath.track(0) });

    const result = await duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toMatchObject([
      expect.objectContaining({ trackIndex: expect.any(Number) }),
      expect.objectContaining({ trackIndex: expect.any(Number) }),
    ]);
  });
});

describe("duplicate - track/scene index validation", () => {
  it("should throw when track index cannot be determined", async () => {
    registerMockObject("track1", {
      path: "live_set some_other_path",
      type: "Track",
    });

    await expect(duplicate({ type: "track", id: "track1" })).rejects.toThrow(
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

    it("should throw for session duplication", async () => {
      await expect(duplicate({ type: "scene", id: "scene1" })).rejects.toThrow(
        'duplicate failed: no scene index for id "scene1"',
      );
    });

    it("should throw for arrangement duplication", async () => {
      await expect(
        duplicate({
          type: "scene",
          id: "scene1",
          arrangementStart: "1|1",
        }),
      ).rejects.toThrow('duplicate failed: no scene index for id "scene1"');
    });
  });
});
