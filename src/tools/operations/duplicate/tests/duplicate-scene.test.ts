// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  children,
  createStandardMidiClipMock,
  registerClipSlot,
  registerMockObject,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";

interface DuplicateClipResult {
  id: string;
  trackIndex: number;
  name?: string;
}

interface DuplicateSceneResult {
  id?: string;
  sceneIndex?: number;
  arrangementStart?: string;
  clips: DuplicateClipResult[];
}

describe("duplicate - scene duplication", () => {
  it("should duplicate a single scene to session view (default behavior)", () => {
    registerMockObject("scene1", { path: livePath.scene(0) });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0", "track1") },
    });

    registerClipSlot(0, 1, true);
    registerClipSlot(1, 1, true);
    // Register clip objects for the duplicated scene's clip slots
    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
      path: livePath.track(1).clipSlot(1).clip(),
    });
    // Register the new scene
    registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

    const result = duplicate({
      type: "scene",
      id: "scene1",
    }) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          trackIndex: 0,
        },
        {
          id: "live_set/tracks/1/clip_slots/1/clip",
          trackIndex: 1,
        },
      ],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
  });

  it("should duplicate multiple scenes with auto-incrementing names", () => {
    registerMockObject("scene1", { path: livePath.scene(0) });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0", "track1") },
    });

    registerClipSlot(0, 1, true);
    registerClipSlot(1, 1, true);
    registerClipSlot(0, 2, true);
    registerClipSlot(1, 2, true);
    // Register clip objects for duplicated scenes
    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
      path: livePath.track(1).clipSlot(1).clip(),
    });
    registerMockObject("live_set/tracks/0/clip_slots/2/clip", {
      path: livePath.track(0).clipSlot(2).clip(),
    });
    registerMockObject("live_set/tracks/1/clip_slots/2/clip", {
      path: livePath.track(1).clipSlot(2).clip(),
    });
    // Register the new scenes
    const scene1 = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });
    const scene2 = registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const result = duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      name: "Custom Scene",
    }) as DuplicateSceneResult[];

    expect(result).toStrictEqual([
      {
        id: "live_set/scenes/1",
        sceneIndex: 1,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            trackIndex: 0,
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            trackIndex: 1,
          },
        ],
      },
      {
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/2/clip",
            trackIndex: 0,
          },
          {
            id: "live_set/tracks/1/clip_slots/2/clip",
            trackIndex: 1,
          },
        ],
      },
    ]);

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 1);

    expect(scene1.set).toHaveBeenCalledWith("name", "Custom Scene");
    expect(scene2.set).toHaveBeenCalledWith("name", "Custom Scene 2");
  });

  it("should duplicate a scene without clips when withoutClips is true", () => {
    registerMockObject("scene1", { path: livePath.scene(0) });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0", "track1", "track2") },
    });

    const slot0 = registerClipSlot(0, 1, true);
    const slot1 = registerClipSlot(1, 1, true);

    registerClipSlot(2, 1, false);
    // Register clip objects so forEachClipInScene finds them
    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
      path: livePath.track(1).clipSlot(1).clip(),
    });
    // Register the new scene
    registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

    const result = duplicate({
      type: "scene",
      id: "scene1",
      withoutClips: true,
    }) as DuplicateSceneResult;

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
    it("should throw error when arrangementStartTime is missing for scene to arrangement", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, or arrangementLocatorName is required when destination is 'arrangement'",
      );
    });

    it("should duplicate a scene to arrangement view", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0", "track1", "track2") },
      });

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
      registerMockObject(livePath.track(0).arrangementClip(0), {
        path: livePath.track(0).arrangementClip(0),
        properties: { is_arrangement_clip: 1, start_time: 16 },
      });
      registerMockObject(livePath.track(2).arrangementClip(0), {
        path: livePath.track(2).arrangementClip(0),
        properties: { is_arrangement_clip: 1, start_time: 16 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
      }) as DuplicateSceneResult;

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
        result.clips.some((c: DuplicateClipResult) => c.trackIndex === 2),
      ).toBe(true);
    });

    it("should duplicate multiple scenes to arrangement view at sequential positions", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0") },
      });

      // Mock scene with one clip of length 8 beats
      registerClipSlot(0, 0, true, createStandardMidiClipMock());

      let clipCounter = 0;

      const track0 = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        methods: {
          duplicate_clip_to_arrangement: () => {
            const clipId = livePath.track(0).arrangementClip(clipCounter);

            clipCounter++;

            return ["id", clipId];
          },
        },
      });

      // Register arrangement clips with sequential start times
      registerMockObject(livePath.track(0).arrangementClip(0), {
        path: livePath.track(0).arrangementClip(0),
        properties: { is_arrangement_clip: 1, start_time: 16 },
      });
      registerMockObject(livePath.track(0).arrangementClip(1), {
        path: livePath.track(0).arrangementClip(1),
        properties: { is_arrangement_clip: 1, start_time: 24 },
      });
      registerMockObject(livePath.track(0).arrangementClip(2), {
        path: livePath.track(0).arrangementClip(2),
        properties: { is_arrangement_clip: 1, start_time: 32 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
        count: 3,
        name: "Scene Copy",
      }) as DuplicateSceneResult[];

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
              trackIndex: 0,
              name: "Scene Copy",
            },
          ],
        },
        {
          arrangementStart: "7|1",
          clips: [
            {
              id: livePath.track(0).arrangementClip(1),
              trackIndex: 0,
              name: "Scene Copy 2",
            },
          ],
        },
        {
          arrangementStart: "9|1",
          clips: [
            {
              id: livePath.track(0).arrangementClip(2),
              trackIndex: 0,
              name: "Scene Copy 3",
            },
          ],
        },
      ]);
    });

    it("should handle empty scenes gracefully", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0", "track1") },
      });

      registerClipSlot(0, 0, false);
      registerClipSlot(1, 0, false);

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
      }) as DuplicateSceneResult;

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });

    it("should duplicate a scene to arrangement without clips when withoutClips is true", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0", "track1", "track2") },
      });

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

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
        withoutClips: true,
      }) as DuplicateSceneResult;

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
});
