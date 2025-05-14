// device/tool-write-track.test.js
import { describe, expect, it, vi } from "vitest";
import { children, liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { MAX_AUTO_CREATED_TRACKS, writeTrack } from "./tool-write-track";

// Mock readTrack since it's used in writeTrack
vi.mock("./tool-read-track", () => ({
  readTrack: vi.fn().mockReturnValue({
    id: "track1",
    type: "midi",
    name: "Test Track",
    trackIndex: 0,
  }),
}));

describe("writeTrack", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("track1");
  });

  it("should update all properties when provided", async () => {
    const result = await writeTrack({
      trackIndex: 0,
      name: "New Track Name",
      color: "#FF0000",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "New Track Name");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("mute", true);
    expect(liveApiSet).toHaveBeenCalledWith("solo", false);
    expect(liveApiSet).toHaveBeenCalledWith("arm", true);
    expect(result.id).toBe("track1");
  });

  it("should not update properties when not provided", async () => {
    const result = await writeTrack({
      trackIndex: 1,
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Only Name Update");
    expect(liveApiSet).not.toHaveBeenCalledWith("color", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("mute", expect.any(Boolean));
    expect(liveApiSet).not.toHaveBeenCalledWith("solo", expect.any(Boolean));
    expect(liveApiSet).not.toHaveBeenCalledWith("arm", expect.any(Boolean));
  });

  it("should fire clip slot when firedSlotIndex is provided and slot exists", async () => {
    liveApiId.mockImplementation(function () {
      if (this.path.includes("clip_slots")) return "clipslot1";
      return "track1";
    });

    const result = await writeTrack({
      trackIndex: 0,
      firedSlotIndex: 2,
    });

    expect(liveApiCall).toHaveBeenCalledWith("fire");
  });

  it("should not fire clip slot when it does not exist", async () => {
    liveApiId.mockImplementation(function () {
      if (this.path.includes("clip_slots")) return "id 0";
      return "track1";
    });

    const result = await writeTrack({
      trackIndex: 0,
      firedSlotIndex: 99,
    });

    expect(liveApiCall).not.toHaveBeenCalledWith("fire");
  });

  it("should stop all clips when firedSlotIndex is -1", async () => {
    const result = await writeTrack({
      trackIndex: 0,
      firedSlotIndex: -1,
    });
    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(liveApiCall).not.toHaveBeenCalledWith("fire");
  });

  it("should handle multiple property updates including firing a clip", async () => {
    const result = await writeTrack({
      trackIndex: 1,
      name: "Multi Update",
      color: "#00FF00",
      mute: false,
      firedSlotIndex: 1,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Multi Update");
    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("mute", false);
    expect(liveApiCall).toHaveBeenCalledWith("fire");
  });

  it("should handle boolean false values correctly", async () => {
    const result = await writeTrack({
      trackIndex: 0,
      mute: false,
      solo: false,
      arm: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("mute", false);
    expect(liveApiSet).toHaveBeenCalledWith("solo", false);
    expect(liveApiSet).toHaveBeenCalledWith("arm", false);
  });

  it("should work with no arguments except trackIndex", async () => {
    const result = await writeTrack({
      trackIndex: 0,
    });

    expect(liveApiSet).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result.id).toBe("track1");
  });

  it("auto-creates tracks when trackIndex exceeds existing tracks", async () => {
    // Start with 3 tracks, with indices 0, 1, and 2
    mockLiveApiGet({
      LiveSet: { tracks: children("track_0", "track_1", "track_2") },
    });

    // Try to write to track 6 (index 5), which doesn't exist yet
    const result = await writeTrack({
      trackIndex: 5,
      name: "Auto-created track",
    });

    // Should create 3 new tracks to make indices 3, 4, and 5
    const createTrackCalls = liveApiCall.mock.calls.filter(
      ([liveApiFunction, ..._args]) => liveApiFunction === "create_midi_track"
    );
    expect(createTrackCalls.length).toBe(3);
    createTrackCalls.forEach((createTrackCall) => {
      expect(createTrackCall).toEqual(["create_midi_track", -1]);
    });
  });

  it("should set back to arranger when requested", async () => {
    const result = await writeTrack({
      trackIndex: 0,
      followsArranger: true,
    });
    expect(liveApiSet).toHaveBeenCalledWith("back_to_arranger", 0);
    expect(result.id).toBe("track1");
  });

  it("throws an error if trackIndex exceeds maximum allowed tracks", async () => {
    await expect(() =>
      writeTrack({
        trackIndex: MAX_AUTO_CREATED_TRACKS,
        name: "This Should Fail",
      })
    ).rejects.toThrow(/exceeds the maximum allowed value/);

    expect(liveApiCall).not.toHaveBeenCalledWith("create_midi_track", expect.any(Number));
  });
});
