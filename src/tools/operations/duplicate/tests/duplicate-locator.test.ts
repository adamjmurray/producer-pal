// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  children,
  createStandardMidiClipMock,
  type RegisteredMockObject,
  registerClipSlot,
  registerMockObject,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

interface CuePointConfig {
  time: number;
  name: string;
}

/**
 * Set up track0 with arrangement clip and locators for duplication tests
 * @param cuePoints - Locator configurations
 * @returns Mock handle for track 0
 */
function setupTrackWithLocators(
  cuePoints: CuePointConfig[],
): RegisteredMockObject {
  const cueIds = cuePoints.map((_, i) => `cue${i}`);

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      tracks: children("track0"),
      cue_points: children(...cueIds),
    },
  });

  for (let i = 0; i < cuePoints.length; i++) {
    // bounded by cuePoints.length
    const cp = cuePoints[i] as CuePointConfig;

    registerMockObject(`cue${i}`, {
      properties: { time: cp.time, name: cp.name },
    });
  }

  const track0 = registerMockObject("live_set/tracks/0", {
    path: livePath.track(0),
    methods: {
      duplicate_clip_to_arrangement: () => [
        "id",
        livePath.track(0).arrangementClip(0),
      ],
      get_notes_extended: () => JSON.stringify({ notes: [] }),
    },
  });

  registerMockObject("live_set tracks 0 arrangement_clips 0", {
    path: livePath.track(0).arrangementClip(0),
    properties: { is_arrangement_clip: 1, start_time: 8 },
  });

  return track0;
}

/**
 * Set up clip + track mocks with locators for clip duplication tests
 * @param cuePoints - Locator configurations
 * @returns Mock handle for track 0
 */
function setupClipWithLocators(
  cuePoints: CuePointConfig[],
): RegisteredMockObject {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
  });
  registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: createStandardMidiClipMock({ length: 4, name: "Test Clip" }),
  });

  return setupTrackWithLocators(cuePoints);
}

describe("duplicate - locator-based arrangement positioning", () => {
  describe("parameter validation", () => {
    it("should throw error when arrangementStart, locatorId, and locatorName are all missing", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, locatorId, or locatorName is required when destination is 'arrangement'",
      );
    });

    it("should throw error when arrangementStart and locatorId are both provided", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "5|1",
          locatorId: "locator-0",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, locatorId, and locatorName are mutually exclusive",
      );
    });

    it("should throw error when arrangementStart and locatorName are both provided", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "5|1",
          locatorName: "Verse",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, locatorId, and locatorName are mutually exclusive",
      );
    });

    it("should throw error when locatorId and locatorName are both provided", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          locatorId: "locator-0",
          locatorName: "Verse",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, locatorId, and locatorName are mutually exclusive",
      );
    });
  });

  describe("scene duplication with locator", () => {
    it("should duplicate a scene to arrangement at locator ID position", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });
      registerClipSlot(0, 0, true, createStandardMidiClipMock());
      const track0 = setupTrackWithLocators([
        { time: 0, name: "Intro" },
        { time: 16, name: "Verse" },
      ]);

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        locatorId: "locator-1",
      });

      // Should duplicate at locator-1's position (16 beats = 5|1)
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );

      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
    });

    it("should duplicate a scene to arrangement at locator name position", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });
      registerClipSlot(0, 0, true, createStandardMidiClipMock());
      const track0 = setupTrackWithLocators([
        { time: 0, name: "Intro" },
        { time: 16, name: "Verse" },
        { time: 32, name: "Chorus" },
      ]);

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        locatorName: "Chorus",
      });

      // Should duplicate at Chorus position (32 beats = 9|1)
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      expect(result).toHaveProperty("arrangementStart", "9|1");
    });
  });

  describe("clip duplication with locator", () => {
    it("should duplicate a clip to arrangement at locator ID position", () => {
      const track0 = setupClipWithLocators([
        { time: 0, name: "Start" },
        { time: 8, name: "Drop" },
      ]);

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        locatorId: "locator-1",
      });

      // Should duplicate at locator-1's position (8 beats = 3|1)
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toHaveProperty("arrangementStart", "3|1");
    });

    it("should duplicate a clip to arrangement at locator name position", () => {
      const track0 = setupClipWithLocators([
        { time: 0, name: "Start" },
        { time: 8, name: "Drop" },
      ]);

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        locatorName: "Drop",
      });

      // Should duplicate at Drop position (8 beats = 3|1)
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toHaveProperty("arrangementStart", "3|1");
    });
  });

  describe("multi-value locators", () => {
    const multiCuePoints: CuePointConfig[] = [
      { time: 0, name: "Intro" },
      { time: 8, name: "Verse" },
      { time: 16, name: "Chorus" },
    ];

    it("should duplicate a clip to multiple locator ID positions", () => {
      const track0 = setupClipWithLocators(multiCuePoints);

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        locatorId: "locator-1, locator-2",
      });

      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );

      expect(result).toHaveLength(2);
    });

    it("should duplicate a clip to multiple locator name positions", () => {
      const track0 = setupClipWithLocators(multiCuePoints);

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        locatorName: "Verse, Chorus",
      });

      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );

      expect(result).toHaveLength(2);
    });

    it("should duplicate a scene to multiple locator ID positions", () => {
      registerMockObject("scene1", { path: livePath.scene(0) });
      registerClipSlot(0, 0, true, createStandardMidiClipMock());
      const track0 = setupTrackWithLocators([
        { time: 0, name: "Intro" },
        { time: 16, name: "Verse" },
        { time: 32, name: "Chorus" },
      ]);

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        locatorId: "locator-1, locator-2",
      });

      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      expect(result).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    /** Helper to set up common mocks for error handling tests */
    function setupErrorHandlingMocks(): void {
      registerMockObject("scene1", { path: livePath.scene(0) });
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: {
          tracks: children("track0"),
          cue_points: children("cue0"),
        },
      });
      registerClipSlot(0, 0, true, {
        length: 8,
        signature_numerator: 4,
        signature_denominator: 4,
      });
      registerMockObject("cue0", { properties: { time: 0, name: "Intro" } });
    }

    it("should throw error for non-existent locator ID", () => {
      setupErrorHandlingMocks();

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          locatorId: "locator-5",
        }),
      ).toThrow("duplicate failed: locator not found: locator-5");
    });

    it("should throw error for non-existent locator name", () => {
      setupErrorHandlingMocks();

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          locatorName: "NonExistent",
        }),
      ).toThrow('duplicate failed: no locator found with name "NonExistent"');
    });
  });
});
