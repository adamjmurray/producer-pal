// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  createTrackResult,
  createTrackResultArray,
  expectDeleteDeviceCalls,
  registerDuplicatedTrackSlots,
  registerMockObject,
  setupProducerPalDeviceMocks,
  setupRoutingMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - track duplication", () => {
  it("should duplicate a single track (default count)", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });

    registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = await duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
  });

  it("should duplicate multiple tracks with same name", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });
    const track1 = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });
    const track2 = registerMockObject("live_set/tracks/2", {
      path: livePath.track(2),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });
    const track3 = registerMockObject("live_set/tracks/3", {
      path: livePath.track(3),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 3,
      name: "Custom Track",
    });

    expect(result).toStrictEqual(createTrackResultArray(1, 3));

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 1);
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 2);

    expect(track1.set).toHaveBeenCalledWith("name", "Custom Track");
    expect(track2.set).toHaveBeenCalledWith("name", "Custom Track");
    expect(track3.set).toHaveBeenCalledWith("name", "Custom Track");
  });

  it("should duplicate a track without clips when withoutClips is true", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    const { newTrack, slots } = registerDuplicatedTrackSlots(
      [true, false, true],
      ["arrangementClip0", "arrangementClip1"],
    );

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    // Verify delete_clip was called for session clips with has_clip
    expect(slots[0]!.call).toHaveBeenCalledWith("delete_clip");
    expect(slots[2]!.call).toHaveBeenCalledWith("delete_clip");

    // Verify delete_clip was called for arrangement clips (on track with clip IDs)
    expect(newTrack.call).toHaveBeenCalledWith(
      "delete_clip",
      "id arrangementClip0",
    );
    expect(newTrack.call).toHaveBeenCalledWith(
      "delete_clip",
      "id arrangementClip1",
    );
  });

  it("should collect session clips when duplicating a track with clips", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerDuplicatedTrackSlots([true, false]);
    // The clip inside slot0, resolved via clipSlot.child("clip")
    registerMockObject("live_set/tracks/1/clip_slots/0/clip", {
      path: livePath.track(1).clipSlot(0).clip(),
      properties: { is_arrangement_clip: 0 },
    });

    const result = await duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1",
      trackIndex: 1,
      clips: [{ id: "live_set/tracks/1/clip_slots/0/clip", slot: "1/0" }],
    });
  });

  it("should duplicate a track without devices when withoutDevices is true", async () => {
    const { liveSet, newTrack } = setupProducerPalDeviceMocks();

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutDevices: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
    expectDeleteDeviceCalls(newTrack, 3);
  });

  it.each([
    ["withoutDevices not specified", undefined],
    ["withoutDevices is false", false],
  ] as const)(
    "should duplicate a track with devices when %s",
    async (_desc: string, withoutDevices: boolean | undefined) => {
      registerMockObject("track1", { path: livePath.track(0) });
      const liveSet = registerMockObject("live_set", {
        path: livePath.liveSet,
      });
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          devices: children("device0", "device1"),
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      const result = await duplicate({
        type: "track",
        id: "track1",
        ...(withoutDevices !== undefined && { withoutDevices }),
      });

      expect(result).toStrictEqual(createTrackResult(1));
      expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);

      // Verify delete_device was NOT called
      expect(newTrack.call).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    },
  );

  it("should remove Producer Pal device when duplicating host track", async () => {
    const { liveSet, newTrack } = setupProducerPalDeviceMocks();

    const result = await duplicate({
      type: "track",
      id: "track1",
    });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);

    // Verify delete_device was called to remove Producer Pal device
    expect(newTrack.call).toHaveBeenCalledWith(
      "delete_device",
      1, // Index 1 where the Producer Pal device is
    );
    // ...and the removal is reported to the user.
    expect(outlet).toHaveBeenCalledWith(
      1,
      "Removed Producer Pal device from duplicated track - the device cannot be duplicated",
    );
  });

  it("should not remove Producer Pal device when withoutDevices is true", async () => {
    const { newTrack } = setupProducerPalDeviceMocks();

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutDevices: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    // Verify delete_device was called 3 times (once for each device)
    // but NOT specifically for Producer Pal before the withoutDevices logic
    const deleteDeviceCalls = newTrack.call.mock.calls.filter(
      (call: unknown[]) => call[0] === "delete_device",
    );

    expect(deleteDeviceCalls).toHaveLength(3);
  });

  describe("routeToSource functionality", () => {
    it("should throw an error when routeToSource is used with non-track type", async () => {
      await expect(
        duplicate({ type: "scene", id: "scene1", routeToSource: true }),
      ).rejects.toThrow(
        "duplicate failed: routeToSource is only supported for type 'track'",
      );
    });

    it("should configure routing when routeToSource is true", async () => {
      const { sourceTrack, newTrack } = setupRoutingMocks({
        monitoringState: 1,
        inputRoutingName: "Audio In",
      });

      const result = await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      expect(result).toStrictEqual(createTrackResult(1));

      // Source input was "Audio In" (not "No Input"), so it is switched to the
      // "No Input" routing type and the change is reported.
      expect(sourceTrack.set).toHaveBeenCalledWith(
        "input_routing_type",
        JSON.stringify({ input_routing_type: { identifier: "no_input_id" } }),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        'Changed track "Source Track" input routing from "Audio In" to "No Input"',
      );

      // New track output is routed to the (single-name-match) source track.
      expect(newTrack.set).toHaveBeenCalledWith(
        "output_routing_type",
        JSON.stringify({
          output_routing_type: { identifier: "source_track_id" },
        }),
      );
    });

    it("warns when the source track name is absent from the output routing options", async () => {
      // newTrack advertises only "Master" as an output — the source name has no
      // match, so no output routing is applied and the miss is reported.
      registerMockObject("track1", { path: livePath.track(0) });
      registerMockObject("live_set", { path: livePath.liveSet });
      registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        properties: {
          name: "Source Track",
          // Already "No Input" so the input-routing branch is skipped; JSON
          // string form matches what getProperty() parses.
          input_routing_type: JSON.stringify({
            input_routing_type: { display_name: "No Input" },
          }),
          arm: 1,
        },
      });
      const newTrack = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: {
          available_output_routing_types: JSON.stringify({
            available_output_routing_types: [
              { display_name: "Master", identifier: "master_id" },
            ],
          }),
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      await duplicate({ type: "track", id: "track1", routeToSource: true });

      expect(newTrack.set).not.toHaveBeenCalledWith(
        "output_routing_type",
        expect.anything(),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        'Could not find track "Source Track" in routing options',
      );
    });

    it("should not change source track monitoring if already set to In", async () => {
      const { sourceTrack } = setupRoutingMocks();

      await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify monitoring was NOT changed
      expect(sourceTrack.set).not.toHaveBeenCalledWith(
        "current_monitoring_state",
        expect.anything(),
      );
    });

    it("should not change source track input routing if already set to No Input", async () => {
      const { sourceTrack } = setupRoutingMocks();

      await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify input routing was NOT changed (setProperty calls this.set for routing)
      expect(sourceTrack.set).not.toHaveBeenCalledWith(
        "input_routing_type",
        expect.anything(),
      );
    });

    it("should override withoutClips to true when routeToSource is true", async () => {
      setupRoutingMocks();

      const result = await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
        withoutClips: false, // This should be overridden
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        trackIndex: expect.any(Number),
        clips: [],
      });
    });

    it("should override withoutDevices to true when routeToSource is true", async () => {
      setupRoutingMocks();

      const result = await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
        withoutDevices: false, // This should be overridden
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        trackIndex: expect.any(Number),
        clips: [],
      });
    });

    it("should arm the source track when routeToSource is true", async () => {
      const { sourceTrack } = setupRoutingMocks({
        inputRoutingName: "Audio In",
        arm: 0,
      });

      await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify the source track was armed
      expect(sourceTrack.set).toHaveBeenCalledWith("arm", 1);

      // It wasn't already armed, so the arm action is reported.
      expect(outlet).toHaveBeenCalledWith(
        1,
        "routeToSource: Armed the source track",
      );
    });

    it("should not emit arm warning when source track is already armed", async () => {
      const { sourceTrack } = setupRoutingMocks({
        inputRoutingName: "Audio In",
        arm: 1,
      });

      vi.mocked(outlet).mockClear();

      await duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify the source track was still set to armed (even though it already was)
      expect(sourceTrack.set).toHaveBeenCalledWith("arm", 1);

      // Verify the arm warning was NOT emitted since it was already armed
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        "routeToSource: Armed the source track",
      );
    });
  });

  it("should apply color when duplicating a track", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    const newTrack = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = await duplicate({
      type: "track",
      id: "track1",
      color: "#ff0000",
    });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(newTrack.set).toHaveBeenCalledWith("color", 0xff0000);
  });
});
