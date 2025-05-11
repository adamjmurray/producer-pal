// device/tool-delete-track.test.js
import { describe, it, expect } from "vitest";
import { mockLiveApiGet, liveApiCall, children } from "./mock-live-api";
import { deleteTrack } from "./tool-delete-track";

describe("deleteTrack", () => {
  it("should delete a track when it exists", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1", "track2", "track3") },
      track2: { name: "MIDI Track 2" },
    });

    const result = deleteTrack({ trackIndex: 1 });

    expect(result.success).toBe(true);
    expect(result.trackIndex).toBe(1);
    expect(result.message).toContain('Deleted track "MIDI Track 2"');
    expect(liveApiCall).toHaveBeenCalledWith("delete_track", 1);
  });

  it("should return an error when track index is negative", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1", "track2") },
    });

    const result = deleteTrack({ trackIndex: -1 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("out of range");
    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("should return an error when track index is too high", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1", "track2") },
    });

    const result = deleteTrack({ trackIndex: 2 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("out of range");
    expect(result.error).toContain("Valid range: 0-1");
    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("should handle no tracks", () => {
    mockLiveApiGet({
      LiveSet: { tracks: [] },
    });

    const result = deleteTrack({ trackIndex: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("out of range");
    expect(result.error).toContain("Valid range: 0--1");
    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("should delete the first track", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1", "track2") },
      track1: { name: "First Track" },
    });

    const result = deleteTrack({ trackIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.trackIndex).toBe(0);
    expect(result.message).toContain('Deleted track "First Track"');
    expect(liveApiCall).toHaveBeenCalledWith("delete_track", 0);
  });

  it("should delete the last track", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1", "track2", "track3") },
      track3: { name: "Last Track" },
    });

    const result = deleteTrack({ trackIndex: 2 });

    expect(result.success).toBe(true);
    expect(result.trackIndex).toBe(2);
    expect(result.message).toContain('Deleted track "Last Track"');
    expect(liveApiCall).toHaveBeenCalledWith("delete_track", 2);
  });
});
