// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import {
  children,
  expectDeleteDeviceCalls,
  type MockObjectHandle,
  registerClipSlot,
  registerMockObject,
} from "./duplicate-test-helpers.ts";
import {
  calculateSceneLength,
  duplicateScene,
  duplicateSceneToArrangement,
  duplicateTrack,
} from "./duplicate-track-scene-helpers.ts";

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

// Mock getHostTrackIndex
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 0),
  }),
);

describe("duplicate-track-scene-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    registerMockObject("live_set", {
      path: "live_set",
      properties: { tracks: ["id", "10", "id", "11", "id", "12"] },
    });
  });

  describe("calculateSceneLength", () => {
    it("should return default minimum length when scene has no clips", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("10") },
      });
      registerClipSlot(0, 0, false);

      const length = calculateSceneLength(0);

      expect(length).toBe(4);
    });

    it("should return length of longest clip in scene", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("10", "11") },
      });
      registerClipSlot(0, 0, true, { length: 8 });
      registerClipSlot(1, 0, true, { length: 12 });

      const length = calculateSceneLength(0);

      expect(length).toBe(12);
    });
  });

  describe("duplicateTrack", () => {
    it("should duplicate a track and return basic info", () => {
      const liveSet = registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: ["id", "10", "id", "11", "id", "12"] },
      });

      registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      const result = duplicateTrack(0);

      expect(result).toMatchObject({
        trackIndex: 1,
        clips: [],
      });

      expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
    });

    it("should set name when provided", () => {
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      duplicateTrack(0, "New Track");

      expect(newTrack.set).toHaveBeenCalledWith("name", "New Track");
    });

    it("should delete all devices when withoutDevices is true", () => {
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: {
          devices: children("device0", "device1", "device2"),
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      duplicateTrack(0, undefined, false, true);

      expectDeleteDeviceCalls(newTrack, 3);
    });

    it("should delete clips when withoutClips is true", () => {
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: {
          devices: [],
          clip_slots: children("slot0", "slot1"),
          arrangement_clips: children("arrClip0"),
        },
      });

      registerMockObject("slot0", {
        path: "live_set tracks 1 clip_slots 0",
        properties: { has_clip: 1 },
      });
      registerMockObject("slot1", {
        path: "live_set tracks 1 clip_slots 1",
        properties: { has_clip: 0 },
      });

      duplicateTrack(0, undefined, true);

      // Should delete arrangement clips on the track
      expect(newTrack.call).toHaveBeenCalledWith("delete_clip", "id arrClip0");
    });

    it("should return empty clips array when no clips exist", () => {
      registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      const result = duplicateTrack(0);

      expect(result.clips).toHaveLength(0);
    });

    it("should configure routing when routeToSource is true", () => {
      registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        properties: {
          name: "Source Track",
          arm: 0,
          input_routing_type: { display_name: "Audio In" },
          available_input_routing_types: [
            { display_name: "No Input", identifier: "no_input_id" },
          ],
        },
      });
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          available_output_routing_types: [
            { display_name: "Source Track", identifier: "source_track_id" },
          ],
        },
      });

      duplicateTrack(0, undefined, false, false, true, 0);

      // Should arm source track
      expect(newTrack.set).not.toHaveBeenCalledWith("arm", 1);
    });

    interface SourceConfig {
      arm?: number;
      input_routing_type: { display_name: string };
      available_input_routing_types?: Array<{
        display_name: string;
        identifier: string;
      }>;
    }

    interface OutputRoutingType {
      display_name: string;
      identifier: string;
    }

    // Helper to register routing mocks with JSON-encoded routing properties
    function setupRoutingMocks(
      sourceConfig: SourceConfig,
      outputRoutingTypes: OutputRoutingType[],
    ): { sourceTrack: MockObjectHandle; newTrack: MockObjectHandle } {
      const sourceTrack = registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        properties: {
          name: "Source Track",
          arm: sourceConfig.arm ?? 0,
          input_routing_type: JSON.stringify({
            input_routing_type: sourceConfig.input_routing_type,
          }),
          available_input_routing_types: JSON.stringify({
            available_input_routing_types:
              sourceConfig.available_input_routing_types ?? [],
          }),
        },
      });
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          available_output_routing_types: JSON.stringify({
            available_output_routing_types: outputRoutingTypes,
          }),
        },
      });

      return { sourceTrack, newTrack };
    }

    it("should not log arming when track is already armed", () => {
      setupRoutingMocks(
        { arm: 1, input_routing_type: { display_name: "No Input" } },
        [{ display_name: "Source Track", identifier: "source_track_id" }],
      );

      duplicateTrack(0, undefined, false, false, true, 0);

      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("Armed the source track"),
      );
    });

    it("should warn when track routing option is not found", () => {
      setupRoutingMocks(
        { arm: 1, input_routing_type: { display_name: "No Input" } },
        [{ display_name: "Other Track", identifier: "other_track_id" }],
      );

      duplicateTrack(0, undefined, false, false, true, 0);

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          'Could not find track "Source Track" in routing options',
        ),
      );
    });

    it("should warn when duplicate track names prevent routing", () => {
      setupRoutingMocks(
        { arm: 1, input_routing_type: { display_name: "No Input" } },
        [
          { display_name: "Source Track", identifier: "source_track_id_1" },
          { display_name: "Source Track", identifier: "source_track_id_2" },
        ],
      );

      duplicateTrack(0, undefined, false, false, true, 0);

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          'Could not route to "Source Track" due to duplicate track names',
        ),
      );
    });

    it("should change source track input routing from non-'No Input' to 'No Input'", () => {
      setupRoutingMocks(
        {
          arm: 0,
          input_routing_type: { display_name: "Audio In" },
          available_input_routing_types: [
            { display_name: "No Input", identifier: "no_input_id" },
            { display_name: "Audio In", identifier: "audio_in_id" },
          ],
        },
        [{ display_name: "Source Track", identifier: "source_track_id" }],
      );

      duplicateTrack(0, undefined, false, false, true, 0);

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          'Changed track "Source Track" input routing from "Audio In" to "No Input"',
        ),
      );
    });

    it("should warn when No Input routing option is not available", () => {
      setupRoutingMocks(
        {
          arm: 0,
          input_routing_type: { display_name: "Audio In" },
          available_input_routing_types: [
            { display_name: "Audio In", identifier: "audio_in_id" },
          ],
        },
        [{ display_name: "Source Track", identifier: "source_track_id" }],
      );

      duplicateTrack(0, undefined, false, false, true, 0);

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining(
          'Tried to change track "Source Track" input routing from "Audio In" to "No Input" but could not find "No Input"',
        ),
      );
    });

    it("should delete session clips when withoutClips is true", () => {
      registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: {
          devices: [],
          clip_slots: children("slot0"),
          arrangement_clips: [],
        },
      });
      const slot0 = registerMockObject("slot0", {
        path: "live_set tracks 1 clip_slots 0",
        properties: { has_clip: 1 },
      });

      duplicateTrack(0, undefined, true);

      expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    });

    it("should collect arrangement clips when withoutClips is false", () => {
      const arrClipId = "arr_clip_456";

      registerMockObject("live_set", {
        path: "live_set",
        properties: {
          tracks: ["id", "10", "id", "11", "id", "12"],
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });
      registerMockObject("live_set/tracks/1", {
        path: "live_set tracks 1",
        properties: {
          devices: [],
          clip_slots: [],
          arrangement_clips: children(arrClipId),
        },
      });
      registerMockObject(arrClipId, {
        path: "live_set tracks 1 arrangement_clips 0",
        properties: {
          is_arrangement_clip: 1,
          start_time: 8,
        },
      });

      const result = duplicateTrack(0, undefined, false); // withoutClips=false (default)

      // Should collect arrangement clips
      expect(result.clips.length).toBeGreaterThan(0);
      expect(result.clips[0]!.id).toBe(arrClipId);
    });
  });

  describe("duplicateScene", () => {
    it("should duplicate a scene and return basic info", () => {
      const liveSet = registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("track0") },
      });

      registerClipSlot(0, 1, false);
      registerMockObject("live_set/scenes/1", { path: "live_set scenes 1" });

      const result = duplicateScene(0);

      expect(result).toMatchObject({
        sceneIndex: 1,
        clips: [],
      });

      expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    });

    it("should set name when provided", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("track0") },
      });
      registerClipSlot(0, 1, false);
      const scene = registerMockObject("live_set/scenes/1", {
        path: "live_set scenes 1",
      });

      duplicateScene(0, "New Scene");

      expect(scene.set).toHaveBeenCalledWith("name", "New Scene");
    });

    it("should delete clips when withoutClips is true", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("track0", "track1") },
      });
      const slot0 = registerClipSlot(0, 1, true);

      registerClipSlot(1, 1, true);
      // Register clip objects so forEachClipInScene finds them
      registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
        path: "live_set tracks 0 clip_slots 1 clip",
      });
      registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
        path: "live_set tracks 1 clip_slots 1 clip",
      });
      registerMockObject("live_set/scenes/1", { path: "live_set scenes 1" });

      const result = duplicateScene(0, undefined, true);

      expect(result.clips).toHaveLength(0);

      // Should delete clips
      expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    });

    it("should collect clips when withoutClips is not true", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("track0") },
      });
      registerClipSlot(0, 1, true);
      registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
        path: "live_set tracks 0 clip_slots 1 clip",
        properties: { is_arrangement_clip: 0 },
      });
      registerMockObject("live_set/scenes/1", { path: "live_set scenes 1" });

      const result = duplicateScene(0);

      expect(result.clips).toHaveLength(1);
    });
  });

  describe("duplicateSceneToArrangement", () => {
    it("should throw error when scene does not exist", () => {
      mockNonExistentObjects();

      expect(() =>
        duplicateSceneToArrangement(
          "scene123",
          16,
          undefined,
          false,
          undefined,
          4,
          4,
        ),
      ).toThrow('duplicate failed: scene with id "scene123" does not exist');
    });

    it("should throw error when scene has no sceneIndex", () => {
      registerMockObject("scene123", { path: "some/invalid/path" });

      expect(() =>
        duplicateSceneToArrangement(
          "scene123",
          16,
          undefined,
          false,
          undefined,
          4,
          4,
        ),
      ).toThrow('duplicate failed: no scene index for id "scene123"');
    });

    it("should return empty clips when withoutClips is true", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("track0") },
      });
      registerClipSlot(0, 0, true);
      registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
        path: "live_set tracks 0 clip_slots 0 clip",
      });

      const result = duplicateSceneToArrangement(
        "scene1",
        16,
        undefined,
        true,
        undefined,
        4,
        4,
      );

      expect(result).toMatchObject({
        arrangementStart: "5|1",
        clips: [],
      });
    });

    it("should use provided arrangementLength", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: children("track0") },
      });
      registerClipSlot(0, 0, true, {
        length: 4,
        signature_numerator: 4,
        signature_denominator: 4,
        is_midi_clip: 1,
      });
      registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        methods: {
          duplicate_clip_to_arrangement: () => [
            "id",
            "live_set tracks 0 arrangement_clips 0",
          ],
        },
      });
      registerMockObject("live_set tracks 0 arrangement_clips 0", {
        path: "live_set tracks 0 arrangement_clips 0",
        properties: { is_arrangement_clip: 1, start_time: 16 },
      });

      const result = duplicateSceneToArrangement(
        "scene1",
        16,
        undefined,
        false,
        "2:0", // 8 beats
        4,
        4,
      );

      expect(result).toHaveProperty("arrangementStart");
      expect(result).toHaveProperty("clips");
    });

    it("should use calculateSceneLength when arrangementLength is not provided", () => {
      registerMockObject("scene1", { path: "live_set scenes 0" });
      registerMockObject("live_set", {
        path: "live_set",
        properties: {
          tracks: children("track0"),
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });
      registerClipSlot(0, 0, true, {
        length: 8,
        signature_numerator: 4,
        signature_denominator: 4,
        is_midi_clip: 1,
      });
      registerMockObject("live_set/tracks/0", {
        path: "live_set tracks 0",
        methods: {
          duplicate_clip_to_arrangement: () => [
            "id",
            "live_set tracks 0 arrangement_clips 0",
          ],
        },
      });
      registerMockObject("live_set tracks 0 arrangement_clips 0", {
        path: "live_set tracks 0 arrangement_clips 0",
        properties: { is_arrangement_clip: 1, start_time: 16 },
      });

      const result = duplicateSceneToArrangement(
        "scene1",
        16,
        "Scene Name",
        false,
        undefined,
        4,
        4,
      );

      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
    });
  });
});
