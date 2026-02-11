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
  type MockObjectHandle,
  registerClipSlot,
  registerMockObject,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - locator-based arrangement positioning", () => {
  describe("parameter validation", () => {
    it("should throw error when arrangementStart, arrangementLocatorId, and arrangementLocatorName are all missing", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });

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

    it("should throw error when arrangementStart and arrangementLocatorId are both provided", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "5|1",
          arrangementLocatorId: "locator-0",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
      );
    });

    it("should throw error when arrangementStart and arrangementLocatorName are both provided", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "5|1",
          arrangementLocatorName: "Verse",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
      );
    });

    it("should throw error when arrangementLocatorId and arrangementLocatorName are both provided", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementLocatorId: "locator-0",
          arrangementLocatorName: "Verse",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
      );
    });
  });

  describe("scene duplication with locator", () => {
    it("should duplicate a scene to arrangement at locator ID position", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });

      // Mock scene with one clip
      registerMockObject("live_set", {
        path: "live_set",
        properties: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
        },
      });
      registerClipSlot(0, 0, true, createStandardMidiClipMock());
      registerMockObject("cue0", { properties: { time: 0, name: "Intro" } });
      registerMockObject("cue1", { properties: { time: 16, name: "Verse" } });

      const track0 = registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        methods: {
          duplicate_clip_to_arrangement: () => [
            "id",
            "live_set tracks 0 arrangement_clips 0",
          ],
          get_notes_extended: () => JSON.stringify({ notes: [] }),
        },
      });

      registerMockObject("live_set tracks 0 arrangement_clips 0", {
        path: "live_set tracks 0 arrangement_clips 0",
        properties: { is_arrangement_clip: 1, start_time: 16 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementLocatorId: "locator-1",
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
      registerMockObject("scene1", { path: "live_set scenes 0" });

      registerMockObject("live_set", {
        path: "live_set",
        properties: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1", "cue2"),
        },
      });
      registerClipSlot(0, 0, true, createStandardMidiClipMock());
      registerMockObject("cue0", { properties: { time: 0, name: "Intro" } });
      registerMockObject("cue1", { properties: { time: 16, name: "Verse" } });
      registerMockObject("cue2", { properties: { time: 32, name: "Chorus" } });

      const track0 = registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        methods: {
          duplicate_clip_to_arrangement: () => [
            "id",
            "live_set tracks 0 arrangement_clips 0",
          ],
          get_notes_extended: () => JSON.stringify({ notes: [] }),
        },
      });

      registerMockObject("live_set tracks 0 arrangement_clips 0", {
        path: "live_set tracks 0 arrangement_clips 0",
        properties: { is_arrangement_clip: 1, start_time: 32 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementLocatorName: "Chorus",
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
    /**
     * Helper to set up mocks for locator-based clip duplication tests
     * @returns Mock handle for track 0
     */
    function setupLocatorDuplicationMocks(): MockObjectHandle {
      registerMockObject("clip1", {
        path: "live_set tracks 0 clip_slots 0 clip",
      });

      registerMockObject("live_set", {
        path: "live_set",
        properties: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
        },
      });
      registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
        path: "live_set tracks 0 clip_slots 0 clip",
        properties: createStandardMidiClipMock({
          length: 4,
          name: "Test Clip",
        }),
      });
      registerMockObject("cue0", { properties: { time: 0, name: "Start" } });
      registerMockObject("cue1", { properties: { time: 8, name: "Drop" } });

      const track0 = registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        methods: {
          duplicate_clip_to_arrangement: () => [
            "id",
            "live_set tracks 0 arrangement_clips 0",
          ],
          get_notes_extended: () => JSON.stringify({ notes: [] }),
        },
      });

      registerMockObject("live_set tracks 0 arrangement_clips 0", {
        path: "live_set tracks 0 arrangement_clips 0",
        properties: { is_arrangement_clip: 1, start_time: 8 },
      });

      return track0;
    }

    it("should duplicate a clip to arrangement at locator ID position", () => {
      const track0 = setupLocatorDuplicationMocks();

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementLocatorId: "locator-1",
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
      const track0 = setupLocatorDuplicationMocks();

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementLocatorName: "Drop",
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

  describe("error handling", () => {
    /** Helper to set up common mocks for error handling tests */
    function setupErrorHandlingMocks(): void {
      registerMockObject("scene1", { path: "live_set scenes 0" });
      registerMockObject("live_set", {
        path: "live_set",
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
          arrangementLocatorId: "locator-5",
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
          arrangementLocatorName: "NonExistent",
        }),
      ).toThrow('duplicate failed: no locator found with name "NonExistent"');
    });
  });
});
