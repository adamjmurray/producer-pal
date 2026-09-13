// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  children,
  expectDeleteDeviceCalls,
  type RegisteredMockObject,
  registerDuplicatedTrackSlots,
  registerMockObject,
} from "../duplicate-test-helpers.ts";
import { duplicateTrack } from "../sources/duplicate-track.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// Mock getHostTrackIndex
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 0),
  }),
);

describe("duplicate-track", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: ["id", "10", "id", "11", "id", "12"] },
    });
  });

  describe("duplicateTrack", () => {
    it("should duplicate a track and return basic info", () => {
      const liveSet = registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: ["id", "10", "id", "11", "id", "12"] },
      });

      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      const result = duplicateTrack(0);

      expect(result).toStrictEqual({
        path: "t1",
        id: "live_set/tracks/1",
        clips: [],
      });

      expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
      // No name/color/routeToSource → none of those side effects fire.
      expect(newTrack.set).not.toHaveBeenCalledWith("name", expect.anything());
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("routing options"),
      );
    });

    it("should set name when provided", () => {
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      duplicateTrack(0, "New Track");

      expect(newTrack.set).toHaveBeenCalledWith("name", "New Track");
    });

    it("should delete all devices when withoutDevices is true", () => {
      expect.hasAssertions();
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          devices: children("device0", "device1", "device2"),
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      duplicateTrack(0, undefined, undefined, false, true);

      expectDeleteDeviceCalls(newTrack, 3);
    });

    it("should delete clips when withoutClips is true", () => {
      const { newTrack } = registerDuplicatedTrackSlots(
        [true, false],
        ["arrClip0"],
      );

      duplicateTrack(0, undefined, undefined, true);

      // Should delete arrangement clips on the track
      expect(newTrack.call).toHaveBeenCalledWith("delete_clip", "id arrClip0");
    });

    it("should warn and continue when this_device can't be read", () => {
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });
      const realFrom = LiveAPI.from.bind(LiveAPI);
      const spy = vi
        .spyOn(LiveAPI, "from")
        .mockImplementation((idOrPath: Parameters<typeof realFrom>[0]) => {
          if (idOrPath === "this_device") {
            throw new Error("Live API not ready");
          }

          return realFrom(idOrPath);
        });

      try {
        expect(duplicateTrack(0).path).toBe("t1");
        expect(newTrack.call).not.toHaveBeenCalledWith(
          "delete_device",
          expect.anything(),
        );
        expect(capturedWarnings()).toContain(
          "could not check the new track t1 (id live_set/tracks/1) for the Producer Pal device",
        );
      } finally {
        spy.mockRestore();
      }
    });

    it("should return empty clips array when no clips exist", () => {
      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      const result = duplicateTrack(0);

      expect(result.clips).toHaveLength(0);
    });

    it("should configure routing when routeToSource is true", () => {
      const sourceTrack = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        properties: {
          name: "Source Track",
          arm: 0,
          input_routing_type: { display_name: "Audio In" },
          available_input_routing_types: [
            { display_name: "No Input", identifier: "no_input_id" },
          ],
        },
      });

      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          available_output_routing_types: [
            { display_name: "Source Track", identifier: "source_track_id" },
          ],
        },
      });

      duplicateTrack(0, undefined, undefined, false, false, true, 0);

      // Should arm source track
      expect(sourceTrack.set).toHaveBeenCalledWith("arm", 1);
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
    ): { sourceTrack: RegisteredMockObject; newTrack: RegisteredMockObject } {
      const sourceTrack = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
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
        path: livePath.track(1),
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

      duplicateTrack(0, undefined, undefined, false, false, true, 0);

      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("Armed the source track"),
      );
    });

    it("should warn when track routing option is not found", () => {
      setupRoutingMocks(
        { arm: 1, input_routing_type: { display_name: "No Input" } },
        [{ display_name: "Other Track", identifier: "other_track_id" }],
      );

      duplicateTrack(0, undefined, undefined, false, false, true, 0);

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          'Could not find track "Source Track" t0 (id live_set/tracks/0) in routing options',
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

      duplicateTrack(0, undefined, undefined, false, false, true, 0);

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          'Could not route to "Source Track" t0 (id live_set/tracks/0) due to duplicate track names',
        ),
      );
    });

    it.each([
      {
        desc: "should change source track input routing from non-'No Input' to 'No Input'",
        availableInputRouting: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "Audio In", identifier: "audio_in_id" },
        ],
        expectedMessage:
          'Changed track "Source Track" t0 (id live_set/tracks/0) input routing from "Audio In" to "No Input"',
      },
      {
        desc: "should warn when No Input routing option is not available",
        availableInputRouting: [
          { display_name: "Audio In", identifier: "audio_in_id" },
        ],
        expectedMessage:
          'Tried to change track "Source Track" t0 (id live_set/tracks/0) input routing from "Audio In" to "No Input" but could not find "No Input"',
      },
    ])("$desc", ({ availableInputRouting, expectedMessage }) => {
      setupRoutingMocks(
        {
          arm: 0,
          input_routing_type: { display_name: "Audio In" },
          available_input_routing_types: availableInputRouting,
        },
        [{ display_name: "Source Track", identifier: "source_track_id" }],
      );

      duplicateTrack(0, undefined, undefined, false, false, true, 0);

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(expectedMessage),
      );
    });

    it("should delete session clips when withoutClips is true", () => {
      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          devices: [],
          clip_slots: children("slot0", "emptySlot"),
          arrangement_clips: [],
        },
      });
      const slot0 = registerMockObject("slot0", {
        path: livePath.track(1).clipSlot(0),
        properties: { has_clip: 1 },
      });
      const emptySlot = registerMockObject("emptySlot", {
        path: livePath.track(1).clipSlot(1),
        properties: { has_clip: 0 },
      });

      duplicateTrack(0, undefined, undefined, true);

      expect(slot0.call).toHaveBeenCalledWith("delete_clip");
      // An empty slot (has_clip 0) is skipped, not deleted.
      expect(emptySlot.call).not.toHaveBeenCalledWith("delete_clip");
    });

    it("should not set color when color is not provided", () => {
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      duplicateTrack(0, "Named Track");

      expect(newTrack.set).toHaveBeenCalledWith("name", "Named Track");
      // color should not be set (setColor is not called)
      expect(newTrack.set).not.toHaveBeenCalledWith("color", expect.anything());
    });

    it("should skip clip slots without clips when collecting session clips", () => {
      registerDuplicatedTrackSlots([false, false]);

      const result = duplicateTrack(0);

      expect(result.clips).toHaveLength(0);
    });

    it("should collect arrangement clips when withoutClips is false", () => {
      const arrClipId = "arr_clip_456";

      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: {
          tracks: ["id", "10", "id", "11", "id", "12"],
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });
      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          devices: [],
          clip_slots: [],
          arrangement_clips: children(arrClipId),
        },
      });
      registerMockObject(arrClipId, {
        path: livePath.track(1).arrangementClip(0),
        properties: {
          is_arrangement_clip: 1,
          start_time: 8,
        },
      });

      const result = duplicateTrack(0, undefined, undefined, false); // withoutClips=false (default)

      // Should collect arrangement clips
      expect(result.clips.length).toBeGreaterThan(0);
      expect(result.clips[0]!.id).toBe(arrClipId);
      // No index fields: the path is the whole address, and start_time 8 in
      // 4/4 is bar 3 beat 1 on the new track.
      expect(result.clips[0]).not.toHaveProperty("trackIndex");
      expect(result.clips[0]).toHaveProperty("path", "t1[3|1]");
    });
  });
});
