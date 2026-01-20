import { describe, expect, it, vi } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  children,
  createTrackResult,
  createTrackResultArray,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  setupRouteToSourceMock,
  setupTrackPath,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";

describe("duplicate - track duplication", () => {
  it("should duplicate a single track (default count)", () => {
    setupTrackPath("track1");

    const result = duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual(createTrackResult(1));

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      0,
    );
  });

  it("should duplicate multiple tracks with auto-incrementing names", () => {
    setupTrackPath("track1");

    const result = duplicate({
      type: "track",
      id: "track1",
      count: 3,
      name: "Custom Track",
    });

    expect(result).toStrictEqual(createTrackResultArray(1, 3));

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      0,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      1,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      2,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "name",
      "Custom Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 2" }),
      "name",
      "Custom Track 2",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 3" }),
      "name",
      "Custom Track 3",
    );
  });

  it("should duplicate a track without clips when withoutClips is true", () => {
    setupTrackPath("track1");

    // Mock track with clips
    mockLiveApiGet({
      "live_set tracks 1": {
        clip_slots: children("slot0", "slot1", "slot2"),
        arrangement_clips: children("arrangementClip0", "arrangementClip1"),
      },
      slot0: { has_clip: 1 },
      slot1: { has_clip: 0 },
      slot2: { has_clip: 1 },
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      0,
    );

    // Verify delete_clip was called for session clips (on clip slots)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: expect.stringContaining("slot") }),
      "delete_clip",
    );

    // Verify delete_clip was called for arrangement clips (on track with clip IDs)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_clip",
      "id arrangementClip0",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_clip",
      "id arrangementClip1",
    );

    // Verify the track instance called delete_clip for arrangement clips
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_clip",
      "id arrangementClip0",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_clip",
      "id arrangementClip1",
    );
  });

  it("should duplicate a track without devices when withoutDevices is true", () => {
    setupTrackPath("track1");

    // Mock track with devices
    mockLiveApiGet({
      "live_set tracks 1": {
        devices: children("device0", "device1", "device2"),
      },
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      withoutDevices: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      0,
    );

    // Verify delete_device was called for each device (backwards)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_device",
      2,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_device",
      1,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_device",
      0,
    );
  });

  it.each([
    ["withoutDevices not specified", undefined],
    ["withoutDevices is false", false],
  ] as const)(
    "should duplicate a track with devices when %s",
    (_desc: string, withoutDevices: boolean | undefined) => {
      setupTrackPath("track1");

      mockLiveApiGet({
        "live_set tracks 1": {
          devices: children("device0", "device1"),
        },
      });

      const result = duplicate({
        type: "track",
        id: "track1",
        ...(withoutDevices !== undefined && { withoutDevices }),
      });

      expect(result).toStrictEqual(createTrackResult(1));

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );

      // Verify delete_device was NOT called
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    },
  );

  /** Sets up mocks for Producer Pal device tests with 3 devices on track 1 */
  function setupProducerPalDeviceMocks(): void {
    liveApiPath.mockImplementation(function (this: {
      _id: string;
      _path: string;
    }): string {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }

      if (this._id === "this_device") {
        return "live_set tracks 0 devices 1";
      }

      return this._path;
    });
    mockLiveApiGet({
      "live_set tracks 1": {
        devices: children("device0", "device1", "device2"),
      },
    });
  }

  it("should remove Producer Pal device when duplicating host track", () => {
    setupProducerPalDeviceMocks();
    liveApiId.mockImplementation(function (this: {
      _path: string;
      _id: string;
    }): string {
      if (this._path === "this_device") {
        return "id device1";
      }

      return this._id!;
    });

    const result = duplicate({
      type: "track",
      id: "track1",
    });

    expect(result).toStrictEqual(createTrackResult(1));

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      0,
    );

    // Verify delete_device was called to remove Producer Pal device
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_device",
      1, // Index 1 where the Producer Pal device is
    );
  });

  it("should not remove Producer Pal device when withoutDevices is true", () => {
    setupProducerPalDeviceMocks();

    const result = duplicate({
      type: "track",
      id: "track1",
      withoutDevices: true,
    });

    expect(result).toStrictEqual(createTrackResult(1));

    // Verify delete_device was called 3 times (once for each device)
    // but NOT specifically for Producer Pal before the withoutDevices logic
    const deleteDeviceCalls = liveApiCall.mock.calls.filter(
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
      setupTrackPath("track1");
      mockLiveApiGet(
        setupRouteToSourceMock({
          monitoringState: 1,
          inputRoutingName: "Audio In",
        }),
      );

      const result = duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      expect(result).toStrictEqual(createTrackResult(1));

      // Test currently simplified to verify basic functionality
      // TODO: Add specific API call verifications when LiveAPI mocking is improved
    });

    it("should not change source track monitoring if already set to In", () => {
      setupTrackPath("track1");
      mockLiveApiGet(setupRouteToSourceMock());

      duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify monitoring was NOT changed
      expect(liveApiSet).not.toHaveBeenCalledWith(
        "current_monitoring_state",
        expect.anything(),
      );
    });

    it("should not change source track input routing if already set to No Input", () => {
      setupTrackPath("track1");
      mockLiveApiGet(setupRouteToSourceMock());

      duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify input routing was NOT changed
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "setProperty",
        "input_routing_type",
        expect.anything(),
      );
    });

    it("should override withoutClips to true when routeToSource is true", () => {
      setupTrackPath("track1");

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
      setupTrackPath("track1");

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
      setupTrackPath("track1");
      mockLiveApiGet(setupRouteToSourceMock({ inputRoutingName: "Audio In" }));

      duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify the source track was armed
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "arm",
        1,
      );
    });

    it("should not emit arm warning when source track is already armed", () => {
      setupTrackPath("track1");
      mockLiveApiGet(
        setupRouteToSourceMock({ inputRoutingName: "Audio In", arm: 1 }),
      );

      const consoleSpy = vi.spyOn(console, "error");

      duplicate({
        type: "track",
        id: "track1",
        routeToSource: true,
      });

      // Verify the source track was still set to armed (even though it already was)
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "arm",
        1,
      );

      // Verify the arm warning was NOT emitted since it was already armed
      expect(consoleSpy).not.toHaveBeenCalledWith(
        "routeToSource: Armed the source track",
      );

      consoleSpy.mockRestore();
    });
  });
});
