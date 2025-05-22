// src/tools/read-clip.test.js
import { describe, expect, it, vi } from "vitest";
import { children, liveApiCall, liveApiId, liveApiPath, mockLiveApiGet } from "../mock-live-api";
import * as notation from "../notation/notation";
import { readClip } from "./read-clip";

// Spy on notation functions
const formatNotationSpy = vi.spyOn(notation, "formatNotation");

describe("readClip", () => {
  beforeEach(() => {
    formatNotationSpy.mockReturnValue("mocked notation");
  });

  afterEach(() => {
    formatNotationSpy.mockClear();
  });

  it("returns clip information when a valid MIDI clip exists", () => {
    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            { note_id: 1, pitch: 60, start_time: 0, duration: 1, velocity: 70 },
            { note_id: 2, pitch: 62, start_time: 1, duration: 1, velocity: 70 },
            { note_id: 3, pitch: 64, start_time: 2, duration: 1, velocity: 70 },
          ],
        });
      }
      return null;
    });

    const result = readClip({ trackIndex: 1, clipSlotIndex: 1 });
    expect(result).toEqual({
      id: "live_set/tracks/1/clip_slots/1/clip",
      name: "Test Clip",
      type: "midi",
      clipSlotIndex: 1,
      trackIndex: 1,
      view: "Session",
      color: "#3DC300",
      length: 4,
      loop: false,
      startMarker: 1,
      endMarker: 5,
      loopStart: 1,
      loopEnd: 5,
      isPlaying: false,
      isTriggered: false,
      notes: "mocked notation",
      noteCount: 3,
    });
  });

  it("returns null values when no clip exists", () => {
    liveApiId.mockReturnValue("id 0");
    const result = readClip({ trackIndex: 2, clipSlotIndex: 3 });
    expect(result).toEqual({
      id: null,
      type: null,
      name: null,
      trackIndex: 2,
      clipSlotIndex: 3,
    });
  });

  it("handles audio clips correctly", () => {
    mockLiveApiGet({
      Clip: { is_midi_clip: 0, name: "Audio Sample", looping: 1, is_playing: 1 },
    });
    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });
    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      name: "Audio Sample",
      type: "audio",
      clipSlotIndex: 0,
      trackIndex: 0,
      view: "Session",
      color: "#3DC300",
      length: 4,
      loop: true,
      startMarker: 1,
      endMarker: 5,
      loopStart: 1,
      loopEnd: 5,
      isPlaying: true,
      isTriggered: false,
    });
  });

  it("reads a session clip by ID", () => {
    mockLiveApiGet({
      session_clip_id: {
        is_arrangement_clip: 0,
      },
    });

    liveApiPath.mockImplementation(function () {
      if (this._id === "session_clip_id") {
        return "live_set tracks 2 clip_slots 4 clip";
      }
    });

    const result = readClip({ clipId: "id session_clip_id" });
    expect(result.id).toBe("session_clip_id");
    expect(result.trackIndex).toBe(2);
    expect(result.clipSlotIndex).toBe(4);
    expect(result.view).toBe("Session");
  });

  it("reads an Arranger clip by ID", () => {
    mockLiveApiGet({
      arranger_clip_id: {
        is_arrangement_clip: 1,
        start_time: 16.0,
      },
    });

    liveApiPath.mockImplementation(function () {
      if (this._id === "arranger_clip_id") {
        return "live_set tracks 3 arrangement_clips 2";
      }
    });

    const result = readClip({ clipId: "id arranger_clip_id" });
    expect(result.id).toBe("arranger_clip_id");
    expect(result.view).toBe("Arranger");
    expect(result.trackIndex).toBe(3);
    expect(result.clipSlotIndex).toBeUndefined();
    expect(result.arrangerStartTime).toBe(16.0);
  });

  it("throws an error when neither clipId nor trackIndex+clipSlotIndex are provided", () => {
    expect(() => readClip({})).toThrow("Either clipId or both trackIndex and clipSlotIndex must be provided");
    expect(() => readClip({ trackIndex: 1 })).toThrow(
      "Either clipId or both trackIndex and clipSlotIndex must be provided"
    );
    expect(() => readClip({ clipSlotIndex: 1 })).toThrow(
      "Either clipId or both trackIndex and clipSlotIndex must be provided"
    );
  });

  // E2E test with real BarBeat notation
  it("detects drum tracks and uses the drum-specific notation conversion (e2e)", () => {
    // Restore real formatNotation for this test
    formatNotationSpy.mockRestore();

    mockLiveApiGet({
      Track: { devices: children("drumRack") },
      drumRack: { can_have_drum_pads: 1 },
      Clip: { is_midi_clip: 1, is_triggered: 1 },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            { note_id: 1, pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
            { note_id: 2, pitch: 38, start_time: 1, duration: 0.25, velocity: 90 },
            { note_id: 3, pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
            { note_id: 4, pitch: 38, start_time: 3, duration: 0.25, velocity: 90 },
          ],
        });
      }
      return null;
    });

    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      type: "midi",
      view: "Session",
      name: "Test Clip",
      trackIndex: 0,
      clipSlotIndex: 0,
      color: "#3DC300",
      length: 4,
      startMarker: 1,
      endMarker: 5,
      loop: false,
      loopEnd: 5,
      loopStart: 1,
      isPlaying: false,
      isTriggered: true,
      noteCount: 4,
      notes: "1:1 t0.25 C1 1:2 v90 D1 1:3 v100 C1 1:4 v90 D1",
    });
  });
});
