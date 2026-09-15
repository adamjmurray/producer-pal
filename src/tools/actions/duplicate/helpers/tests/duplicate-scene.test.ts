// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import {
  children,
  type RegisteredMockObject,
  registerClipSlot,
  registerMockObject,
} from "../duplicate-test-helpers.ts";
import {
  calculateSceneLength,
  duplicateScene,
  duplicateSceneToArrangement,
} from "../sources/duplicate-scene.ts";

// Mock updateClip to avoid complex internal logic
// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("#src/tools/clip/update/update-clip.ts"), () => ({
  updateClip: vi.fn(({ ids }: { ids: string }) => {
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.ts"), () => ({
  clearClipAtDuplicateTarget: vi.fn(() => true),
  createShortenedClipInHolding: vi.fn(() => ({
    holdingClipId: "holding_clip_id",
    holdingClip: { id: "holding_clip_id" },
  })),
  moveClipFromHolding: vi.fn(
    (_holdingClipId: string, track: { path: string }, _startBeats: number) => {
      const clipId = `${track.path} arrangement_clips 0`;

      return {
        id: clipId,
        path: clipId,
        set: vi.fn(),
        setAll: vi.fn(),
        getProperty: vi.fn((prop: string) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          if (prop === "start_time") {
            return _startBeats;
          }

          return null;
        }),
        get trackIndex() {
          const match = clipId.match(/tracks (\d+)/);

          return match ? Number.parseInt(match[1]!) : null;
        },
      };
    },
  ),
}));

describe("duplicate-scene", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: ["id", "10", "id", "11", "id", "12"] },
    });
  });

  describe("calculateSceneLength", () => {
    it("should return default minimum length when scene has no clips", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("10") },
      });
      registerClipSlot(0, 0, false);

      const length = calculateSceneLength(0);

      expect(length).toBe(4);
    });

    it("should return length of longest clip in scene", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("10", "11") },
      });
      registerClipSlot(0, 0, true, { length: 8 });
      registerClipSlot(1, 0, true, { length: 12 });

      const length = calculateSceneLength(0);

      expect(length).toBe(12);
    });
  });

  /**
   * Register common mocks for duplicateScene tests (liveSet, clipSlot, scene).
   * @returns Object with liveSet and scene mocks
   */
  function setupDuplicateSceneMocks(): {
    liveSet: RegisteredMockObject;
    scene: RegisteredMockObject;
  } {
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0") },
    });

    registerClipSlot(0, 1, false);
    const scene = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });

    return { liveSet, scene };
  }

  describe("duplicateScene", () => {
    it("should duplicate a scene and return basic info", () => {
      const { liveSet, scene } = setupDuplicateSceneMocks();

      const result = duplicateScene(0);

      expect(result).toStrictEqual({
        path: "s1",
        id: "live_set/scenes/1",
        clips: [],
      });

      expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
      // No name provided → the name setter is skipped.
      expect(scene.set).not.toHaveBeenCalledWith("name", expect.anything());
    });

    it("should set name when provided", () => {
      const { scene } = setupDuplicateSceneMocks();

      duplicateScene(0, "New Scene");

      expect(scene.set).toHaveBeenCalledWith("name", "New Scene");
    });

    it("should not set color when color is not provided", () => {
      const { scene } = setupDuplicateSceneMocks();

      duplicateScene(0, "Named Scene");

      expect(scene.set).toHaveBeenCalledWith("name", "Named Scene");
      expect(scene.set).not.toHaveBeenCalledWith("color", expect.anything());
    });

    it("should delete clips when withoutClips is true", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0", "track1") },
      });
      const slot0 = registerClipSlot(0, 1, true);

      registerClipSlot(1, 1, true);
      // Register clip objects so forEachClipInScene finds them
      registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
        path: livePath.track(0).clipSlot(1).clip(),
      });
      registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
        path: livePath.track(1).clipSlot(1).clip(),
      });
      registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

      const result = duplicateScene(0, undefined, undefined, true);

      expect(result.clips).toHaveLength(0);

      // Should delete clips
      expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    });

    it("should collect clips when withoutClips is not true", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0") },
      });
      registerClipSlot(0, 1, true);
      registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
        path: livePath.track(0).clipSlot(1).clip(),
        properties: { is_arrangement_clip: 0 },
      });
      registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

      const result = duplicateScene(0);

      expect(result.clips).toHaveLength(1);
    });
  });

  /**
   * Register scene and liveSet mocks for duplicateSceneToArrangement tests.
   * @param extraLiveSetProps - Additional properties for the liveSet mock
   */
  function setupSceneToArrangementBaseMocks(
    extraLiveSetProps: Record<string, unknown> = {},
  ): void {
    registerMockObject("scene1", { path: livePath.scene(0) });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0"), ...extraLiveSetProps },
    });
  }

  /**
   * Register the scene, liveSet, track and arrangement-clip mocks one
   * scene-to-arrangement duplicate needs.
   * @param clipLength - Length of the scene's single source clip, in beats
   * @param extraLiveSetProps - Additional properties for the liveSet mock
   */
  function setupSceneToArrangementClipMocks(
    clipLength: number,
    extraLiveSetProps: Record<string, unknown> = {},
  ): void {
    setupSceneToArrangementBaseMocks(extraLiveSetProps);
    registerClipSlot(0, 0, true, {
      length: clipLength,
      signature_numerator: 4,
      signature_denominator: 4,
      is_midi_clip: 1,
    });
    registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
      methods: {
        duplicate_clip_to_arrangement: () => [
          "id",
          livePath.track(0).arrangementClip(0),
        ],
      },
    });
    registerMockObject(livePath.track(0).arrangementClip(0), {
      path: livePath.track(0).arrangementClip(0),
      properties: { is_arrangement_clip: 1, start_time: 16 },
    });
  }

  describe("duplicateSceneToArrangement", () => {
    it("should throw error when scene does not exist", async () => {
      mockNonExistentObjects();

      await expect(
        duplicateSceneToArrangement(
          "scene123",
          16,
          undefined,
          undefined,
          false,
          undefined,
          4,
          4,
        ),
      ).rejects.toThrow('scene with id "scene123" does not exist');
    });

    it("should throw error when scene has no sceneIndex", async () => {
      registerMockObject("scene123", { path: "some/invalid/path" });

      await expect(
        duplicateSceneToArrangement(
          "scene123",
          16,
          undefined,
          undefined,
          false,
          undefined,
          4,
          4,
        ),
      ).rejects.toThrow('no scene index for id "scene123"');
    });

    it("should return empty clips when withoutClips is true", async () => {
      setupSceneToArrangementBaseMocks();
      registerClipSlot(0, 0, true);
      registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
        path: livePath.track(0).clipSlot(0).clip(),
      });

      const result = await duplicateSceneToArrangement(
        "scene1",
        16,
        undefined,
        undefined,
        true,
        undefined,
        4,
        4,
      );

      expect(result).toStrictEqual({ clips: [] });
    });

    it.each([
      {
        desc: "should use provided arrangementLength",
        clipLength: 4,
        liveSetExtra: {},
        sceneName: undefined as string | undefined,
        arrangementLength: "2bar" as string | undefined,
        // Lengthening runs through updateClip, which these mocks stop short of,
        // so the batch collects no clip.
        expectedClipPath: undefined as string | undefined,
      },
      {
        desc: "should use calculateSceneLength when arrangementLength is not provided",
        clipLength: 8,
        liveSetExtra: { signature_numerator: 4, signature_denominator: 4 },
        sceneName: "Scene Name",
        arrangementLength: undefined,
        // start_time 16 in 4/4 is bar 5 beat 1.
        expectedClipPath: "t0[5|1]",
      },
    ])(
      "$desc",
      async ({
        clipLength,
        liveSetExtra,
        sceneName,
        arrangementLength,
        expectedClipPath,
      }) => {
        setupSceneToArrangementClipMocks(clipLength, liveSetExtra);

        const result = await duplicateSceneToArrangement(
          "scene1",
          16,
          sceneName,
          undefined,
          false,
          arrangementLength,
          4,
          4,
        );

        // The clip's own path is the only place the copy's position is
        // reported; the batch carries none of its own.
        expect(result).toHaveProperty("clips");
        expect(result.clips[0]?.path).toBe(expectedClipPath);
      },
    );

    it("reports each clip as id and path, never the requested name", async () => {
      // The name lands on the clip itself, so reporting it back would echo an
      // arg that took effect as intended.
      setupSceneToArrangementClipMocks(8, {
        signature_numerator: 4,
        signature_denominator: 4,
      });

      const result = await duplicateSceneToArrangement(
        "scene1",
        16,
        "Scene Name",
        undefined,
        false,
        undefined,
        4,
        4,
      );

      expect(result.clips).toStrictEqual([
        { id: expect.any(String), path: "t0[5|1]" },
      ]);
    });
  });
});
