// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  createStandardMidiClipMock,
  registerArrangementClip,
  registerClipMocks,
  registerClipSlot,
  registerMockObject,
  registerTrackWithArrangementDup,
  setupArrangementSceneMocks,
  setupSessionSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

interface DuplicateClipResult {
  id: string;
  path?: string;
  name?: string;
}

interface DuplicateSceneResult {
  id?: string;
  sceneIndex?: number;
  arrangementStart?: string;
  clips: DuplicateClipResult[];
}

const SCENE_CLIP_ID = "id live_set/tracks/0/clip_slots/0/clip";

/**
 * Assert the scene's source clip was duplicated to the arrangement at a beat.
 * @param track - Track mock holding the duplicate_clip_to_arrangement method
 * @param beat - Expected arrangement start beat
 */
function expectSceneDupAtBeat(
  track: ReturnType<typeof registerTrackWithArrangementDup>,
  beat: number,
): void {
  expect(track.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    SCENE_CLIP_ID,
    beat,
  );
}

describe("duplicate - scene duplication", () => {
  it("should duplicate a single scene to session view (default behavior)", async () => {
    const liveSet = setupSessionSceneMocks();

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
    })) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          path: "t0/s1",
        },
        {
          id: "live_set/tracks/1/clip_slots/1/clip",
          path: "t1/s1",
        },
      ],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
  });

  it("should duplicate multiple scenes with same name", async () => {
    const liveSet = setupSessionSceneMocks({ registerNewScene: false });

    // Register additional clip slots and mocks for second duplicated scene
    registerClipSlot(0, 2, true);
    registerClipSlot(1, 2, true);
    registerClipMocks(2, 2);

    const scene1 = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });
    const scene2 = registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      name: "Custom Scene",
    })) as DuplicateSceneResult[];

    expect(result).toStrictEqual([
      {
        id: "live_set/scenes/1",
        sceneIndex: 1,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            path: "t0/s1",
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            path: "t1/s1",
          },
        ],
      },
      {
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/2/clip",
            path: "t0/s2",
          },
          {
            id: "live_set/tracks/1/clip_slots/2/clip",
            path: "t1/s2",
          },
        ],
      },
    ]);

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 1);

    expect(scene1.set).toHaveBeenCalledWith("name", "Custom Scene");
    expect(scene2.set).toHaveBeenCalledWith("name", "Custom Scene");
  });

  it("should duplicate a scene without clips when withoutClips is true", async () => {
    const liveSet = setupArrangementSceneMocks();

    const slot0 = registerClipSlot(0, 1, true);
    const slot1 = registerClipSlot(1, 1, true);

    registerClipSlot(2, 1, false);
    registerClipMocks(2, 1);
    registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      withoutClips: true,
    })) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);

    // Verify delete_clip was called for clips in the duplicated scene
    expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    expect(slot1.call).toHaveBeenCalledWith("delete_clip");

    const slot0DeleteCalls = slot0.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "delete_clip",
    ).length;
    const slot1DeleteCalls = slot1.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "delete_clip",
    ).length;

    expect(slot0DeleteCalls + slot1DeleteCalls).toBe(2);
  });

  describe("arrangement destination", () => {
    it("should duplicate a scene to arrangement view", async () => {
      setupArrangementSceneMocks();

      registerClipSlot(
        0,
        0,
        true,
        createStandardMidiClipMock({
          length: 4,
          name: "Clip 1",
        }),
      );
      registerClipSlot(1, 0, false);
      registerClipSlot(2, 0, true, {
        length: 8,
        name: "Clip 2",
        color: 8355711,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
        loop_start: 0,
        loop_end: 8,
        is_midi_clip: 1,
      });

      // Register tracks with duplicate_clip_to_arrangement method
      const track0 = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        methods: {
          duplicate_clip_to_arrangement: (clipId: unknown) => {
            const trackMatch = (clipId as string).match(/tracks\/(\d+)/);
            const trackIdx = trackMatch ? Number(trackMatch[1]) : 0;

            return ["id", livePath.track(trackIdx).arrangementClip(0)];
          },
        },
      });

      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
      });
      const track2 = registerMockObject("live_set/tracks/2", {
        path: livePath.track(2),
        methods: {
          duplicate_clip_to_arrangement: (clipId: unknown) => {
            const trackMatch = (clipId as string).match(/tracks\/(\d+)/);
            const trackIdx = trackMatch ? Number(trackMatch[1]) : 2;

            return ["id", livePath.track(trackIdx).arrangementClip(0)];
          },
        },
      });

      // Register arrangement clips
      registerArrangementClip(0, 0, 16);
      registerArrangementClip(2, 0, 16);

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
      })) as DuplicateSceneResult;

      // Both clips now use duplicate_clip_to_arrangement
      // Track 0 clip (4 beats -> 8 beats) - lengthened via updateClip
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      // Track 2 clip (8 beats -> 8 beats) - exact match, no updateClip needed
      expect(track2.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/2/clip_slots/0/clip",
        16,
      );

      // Verify result structure
      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
      expect(Array.isArray(result.clips)).toBe(true);
      // At least the exact-match clip (track 2) should appear
      // Track 0's lengthening via updateClip is tested in updateClip's own tests
      expect(
        result.clips.some((c: DuplicateClipResult) => c.path === "t2"),
      ).toBe(true);
    });

    it("rejects a 0-indexed arrangementStart with the 1-indexing steer", async () => {
      setupArrangementSceneMocks();

      // Parity with create-clip: a 0-indexed/zero-bar arrangement start is a
      // hard error, not a silent pre-origin beat.
      await expect(
        duplicate({ type: "scene", id: "scene1", arrangementStart: "0|1" }),
      ).rejects.toThrow(/1-indexed/);
    });

    it("rejects a malformed arrangementStart that parses to no positions", async () => {
      setupArrangementSceneMocks();

      // "," survives the earlier trim-only checks but parses to zero positions;
      // it must throw, not silently produce no duplicates.
      await expect(
        duplicate({ type: "scene", id: "scene1", arrangementStart: "," }),
      ).rejects.toThrow(/no valid bar\|beat positions/);
    });

    it("should duplicate multiple scenes to arrangement view at sequential positions", async () => {
      setupArrangementSceneMocks(1);

      // Mock scene with one clip of length 8 beats
      registerClipSlot(0, 0, true, createStandardMidiClipMock());

      const track0 = registerTrackWithArrangementDup(0);

      // Register arrangement clips with sequential start times
      registerArrangementClip(0, 0, 16);
      registerArrangementClip(0, 1, 24);
      registerArrangementClip(0, 2, 32);

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
        count: 3,
        name: "Scene Copy",
      })) as DuplicateSceneResult[];

      // Scenes should be placed at sequential positions based on scene length (8 beats)
      // All use duplicate_clip_to_arrangement (exact match, no lengthening needed)
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        24,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      expect(result).toStrictEqual([
        {
          arrangementStart: "5|1",
          clips: [
            {
              id: livePath.track(0).arrangementClip(0),
              path: "t0",
              name: "Scene Copy",
            },
          ],
        },
        {
          arrangementStart: "7|1",
          clips: [
            {
              id: livePath.track(0).arrangementClip(1),
              path: "t0",
              name: "Scene Copy",
            },
          ],
        },
        {
          arrangementStart: "9|1",
          clips: [
            {
              id: livePath.track(0).arrangementClip(2),
              path: "t0",
              name: "Scene Copy",
            },
          ],
        },
      ]);
    });

    it("places a single scene at comma-separated arrangementStart positions", async () => {
      setupArrangementSceneMocks(1);

      registerClipSlot(0, 0, true, createStandardMidiClipMock());

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 16);
      registerArrangementClip(0, 1, 32);

      // Regression: a comma-separated arrangementStart threw for scenes while it
      // worked for clips. Both explicit positions are now honored: 5|1 -> beat
      // 16, 9|1 -> beat 32 (count defaults to 1, so no sequential expansion).
      const result = (await duplicate({
        type: "scene",
        id: "scene1",
        arrangementStart: "5|1, 9|1",
        name: "Scene Copy",
      })) as DuplicateSceneResult[];

      expectSceneDupAtBeat(track0, 16);
      expectSceneDupAtBeat(track0, 32);
      expect(result.map((r) => r.arrangementStart)).toStrictEqual([
        "5|1",
        "9|1",
      ]);
    });

    it("should handle empty scenes gracefully", async () => {
      setupArrangementSceneMocks(2);

      registerClipSlot(0, 0, false);
      registerClipSlot(1, 0, false);

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
      })) as DuplicateSceneResult;

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });

    it("should duplicate a scene to arrangement without clips when withoutClips is true", async () => {
      setupArrangementSceneMocks();

      registerClipSlot(0, 0, true, { length: 4 });
      registerClipSlot(1, 0, false);
      registerClipSlot(2, 0, true, { length: 8 });

      const track0 = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
      });

      const track1 = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
      });
      const track2 = registerMockObject("live_set/tracks/2", {
        path: livePath.track(2),
      });

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
        withoutClips: true,
      })) as DuplicateSceneResult;

      // Verify that duplicate_clip_to_arrangement was NOT called on any track
      expect(track0.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );
      expect(track1.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );
      expect(track2.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });
  });

  it("should apply color when duplicating a scene", async () => {
    registerMockObject("scene1", { path: livePath.scene(0) });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: [] },
    });

    const newScene = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      color: "#00ff00",
    })) as DuplicateSceneResult;

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(newScene.set).toHaveBeenCalledWith("color", 0x00ff00);
    expect(result.id).toBe("live_set/scenes/1");
    expect(result.sceneIndex).toBe(1);
  });

  it("names the positions a cut-short arrangement duplicate did not reach", async () => {
    // A scene copy places a clip per track, so a few can eat the whole budget.
    setupArrangementSceneMocks(1);

    const track0 = registerTrackWithArrangementDup(0);

    const result = await duplicate(
      { type: "scene", id: "scene1", arrangementStart: "5|1,9|1" },
      { deadline: Date.now() - 1 },
    );

    expect(result).toStrictEqual([]);
    expect(track0.call).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "Ran out of time after duplicating 0 of 2. " +
        "Not duplicated: 5|1, 9|1. Re-run for those positions.",
    );
  });
});
