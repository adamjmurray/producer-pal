// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  children,
  createTrackResult,
  createTrackResultArray,
  expectDeleteDeviceCalls,
  registerMockObject,
  setupProducerPalDeviceMocks,
  setupRoutingMocks,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - track duplication", () => {
  it("should duplicate a single track (default count)", () => {
    registerMockObject("track1", { path: livePath.track(0) });
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });

    registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual(createTrackResult(1));
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);
  });

  it("should duplicate multiple tracks with auto-incrementing names", () => {
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

    const result = duplicate({
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
    expect(track2.set).toHaveBeenCalledWith("name", "Custom Track 2");
    expect(track3.set).toHaveBeenCalledWith("name", "Custom Track 3");
  });

  it("should duplicate a track without clips when withoutClips is true", () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    const newTrack = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: {
        devices: [],
        clip_slots: children("slot0", "slot1", "slot2"),
        arrangement_clips: children("arrangementClip0", "arrangementClip1"),
      },
    });

    // Register clip slot children
    const slot0 = registerMockObject("slot0", {
      path: livePath.track(1).clipSlot(0),
      properties: { has_clip: 1 },
    });

    registerMockObject("slot1", {
      path: livePath.track(1).clipSlot(1),
      properties: { has_clip: 0 },
    });
    const slot2 = registerMockObject("slot2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 1 },
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    // Verify delete_clip was called for session clips with has_clip
    expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    expect(slot2.call).toHaveBeenCalledWith("delete_clip");

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

  it("should duplicate a track without devices when withoutDevices is true", () => {
    registerMockObject("track1", { path: livePath.track(0) });
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });
    const newTrack = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: {
        devices: children("device0", "device1", "device2"),
        clip_slots: [],
        arrangement_clips: [],
      },
    });

    const result = duplicate({
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
    (_desc: string, withoutDevices: boolean | undefined) => {
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

      const result = duplicate({
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

  it("should remove Producer Pal device when duplicating host track", () => {
    const { liveSet, newTrack } = setupProducerPalDeviceMocks();

    const result = duplicate({
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
  });

  it("should not remove Producer Pal device when withoutDevices is true", () => {
    const { newTrack } = setupProducerPalDeviceMocks();

    const result = duplicate({
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
    it("should throw an error when routeToSource is used with non-track type", () => {
      expect(() =>
        duplicate({ type: "scene", id: "scene1", routeToSource: true }),
      ).toThrow(
        "duplicate failed: routeToSource is only supported for type 'track'",
      );
    });

    it("should configure routing when routeToSource is true", () => {
      setupRoutingMocks({
        monitoringState: 1,
        inputRoutingName: "Audio In",
      });

      const result = duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      expect(result).toStrictEqual(createTrackResult(1));
    });

    it("should not change source track monitoring if already set to In", () => {
      const { sourceTrack } = setupRoutingMocks();

      duplicate({
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

    it("should not change source track input routing if already set to No Input", () => {
      const { sourceTrack } = setupRoutingMocks();

      duplicate({
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

    it("should override withoutClips to true when routeToSource is true", () => {
      setupRoutingMocks();

      const result = duplicate({
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

    it("should override withoutDevices to true when routeToSource is true", () => {
      setupRoutingMocks();

      const result = duplicate({
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

    it("should arm the source track when routeToSource is true", () => {
      const { sourceTrack } = setupRoutingMocks({
        inputRoutingName: "Audio In",
      });

      duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify the source track was armed
      expect(sourceTrack.set).toHaveBeenCalledWith("arm", 1);
    });

    it("should not emit arm warning when source track is already armed", () => {
      const { sourceTrack } = setupRoutingMocks({
        inputRoutingName: "Audio In",
        arm: 1,
      });

      vi.mocked(outlet).mockClear();

      duplicate({
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
});
