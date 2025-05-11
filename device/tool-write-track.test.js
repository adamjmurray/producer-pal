// device/tool-write-track.test.js
import { describe, it, expect, vi } from "vitest";
import { liveApiSet, liveApiCall, liveApiId } from "./mock-live-api";
import { writeTrack } from "./tool-write-track";

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

  it("should throw an error when track does not exist", () => {
    liveApiId.mockReturnValue("id 0");

    expect(() => writeTrack({ trackIndex: 99 })).toThrow("Track index 99 does not exist");
  });

  it("should update all properties when provided", () => {
    const result = writeTrack({
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

  it("should not update properties when not provided", () => {
    const result = writeTrack({
      trackIndex: 1,
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Only Name Update");
    expect(liveApiSet).not.toHaveBeenCalledWith("color", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("mute", expect.any(Boolean));
    expect(liveApiSet).not.toHaveBeenCalledWith("solo", expect.any(Boolean));
    expect(liveApiSet).not.toHaveBeenCalledWith("arm", expect.any(Boolean));
  });

  it("should fire clip slot when firedSlotIndex is provided and slot exists", () => {
    liveApiId.mockImplementation(function () {
      if (this.path.includes("clip_slots")) return "clipslot1";
      return "track1";
    });

    const result = writeTrack({
      trackIndex: 0,
      firedSlotIndex: 2,
    });

    expect(liveApiCall).toHaveBeenCalledWith("fire");
  });

  it("should not fire clip slot when it does not exist", () => {
    liveApiId.mockImplementation(function () {
      if (this.path.includes("clip_slots")) return "id 0";
      return "track1";
    });

    const result = writeTrack({
      trackIndex: 0,
      firedSlotIndex: 99,
    });

    expect(liveApiCall).not.toHaveBeenCalledWith("fire");
  });

  it("should stop all clips when firedSlotIndex is -1", () => {
    const result = writeTrack({
      trackIndex: 0,
      firedSlotIndex: -1,
    });
    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(liveApiCall).not.toHaveBeenCalledWith("fire");
  });

  it("should handle multiple property updates including firing a clip", () => {
    const result = writeTrack({
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

  it("should handle boolean false values correctly", () => {
    const result = writeTrack({
      trackIndex: 0,
      mute: false,
      solo: false,
      arm: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("mute", false);
    expect(liveApiSet).toHaveBeenCalledWith("solo", false);
    expect(liveApiSet).toHaveBeenCalledWith("arm", false);
  });

  it("should work with no arguments except trackIndex", () => {
    const result = writeTrack({
      trackIndex: 0,
    });

    expect(liveApiSet).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result.id).toBe("track1");
  });
});
