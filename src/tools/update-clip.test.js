// src/tools/update-clip.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import { updateClip } from "./update-clip";

describe("updateClip", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id clip1":
          return "clip1";
        case "id clip2":
          return "clip2";
        case "id clip3":
          return "clip3";
        default:
          return "id 0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "clip1":
          return "live_set tracks 0 clip_slots 0 clip";
        case "clip2":
          return "live_set tracks 1 clip_slots 1 clip";
        case "clip3":
          return "live_set tracks 2 arrangement_clips 0";
        default:
          return "";
      }
    });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateClip({})).toThrow("updateClip failed: ids is required");
    expect(() => updateClip({ name: "Test" })).toThrow("updateClip failed: ids is required");
  });

  it("should throw error when clip ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => updateClip({ ids: "nonexistent" })).toThrow(
      'updateClip failed: clip with id "nonexistent" does not exist'
    );
  });

  it("should update a single session clip by ID", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "clip1",
      name: "Updated Clip",
      color: "#FF0000",
      loop: true,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Updated Clip");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("looping", true);

    expect(result).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Updated Clip",
      color: "#FF0000",
      loop: true,
    });
  });

  it("should update a single arranger clip by ID", () => {
    mockLiveApiGet({
      clip3: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 16.0,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "clip3",
      name: "Arranger Clip",
      startMarker: "1:3", // 2 beats = bar 1 beat 3 in 4/4
      endMarker: "2:3", // 6 beats = bar 2 beat 3 in 4/4
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Arranger Clip");
    expect(liveApiSet).toHaveBeenCalledWith("start_marker", 2); // 1:3 in 4/4 = 2 Ableton beats
    expect(liveApiSet).toHaveBeenCalledWith("end_marker", 6); // 2:3 in 4/4 = 6 Ableton beats

    expect(result).toEqual({
      id: "clip3",
      type: "midi",
      view: "Arranger",
      trackIndex: 2,
      arrangerStartTime: 16.0,
      name: "Arranger Clip",
      startMarker: "1:3",
      endMarker: "2:3",
    });
  });

  it("should update multiple clips by comma-separated IDs", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      clip2: {
        is_arrangement_clip: 0,
        is_midi_clip: 0, // audio clip
      },
    });

    const result = updateClip({
      ids: "clip1, clip2",
      color: "#00FF00",
      loop: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("looping", false);
    expect(liveApiSet).toHaveBeenCalledTimes(5); // 2 calls per clip, plus view change
    expect(liveApiSet).toHaveBeenNthCalledWith(1, "color", 65280);
    expect(liveApiSet).toHaveBeenNthCalledWith(2, "looping", false);
    expect(liveApiSet).toHaveBeenNthCalledWith(3, "detail_clip", "id clip1");
    expect(liveApiSet).toHaveBeenNthCalledWith(4, "color", 65280);
    expect(liveApiSet).toHaveBeenNthCalledWith(5, "looping", false);

    expect(result).toEqual([
      {
        id: "clip1",
        type: "midi",
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        color: "#00FF00",
        loop: false,
      },
      {
        id: "clip2",
        type: "audio",
        view: "Session",
        trackIndex: 1,
        clipSlotIndex: 1,
        color: "#00FF00",
        loop: false,
      },
    ]);
  });

  it("should update time signature when provided", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "clip1",
      timeSignature: "6/8",
    });

    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result.timeSignature).toBe("6/8");
  });

  it("should replace existing notes with real BarBeat parsing in 4/4 time", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "clip1",
      notes: "1:1 v80 t2 C4 1:3 v120 t1 D4",
    });

    expect(liveApiCall).toHaveBeenCalledWith("remove_notes_extended", 0, 127, 0, 1000000);
    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 72,
          velocity: 80,
          start_time: 0,
          duration: 2,
          probability: 1,
          velocity_deviation: 0,
        },
        {
          pitch: 74,
          velocity: 120,
          start_time: 2,
          duration: 1,
          probability: 1,
          velocity_deviation: 0,
        },
      ],
    });

    expect(result).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 v80 t2 C4 1:3 v120 t1 D4",
    });
  });

  it("should parse notes using provided time signature with real BarBeat parsing", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "clip1",
      timeSignature: "6/8",
      notes: "1:1 C3 2:1 D3",
    });

    // In 6/8 time, bar 2 beat 1 should be 3 Ableton beats (6 musical beats * 4/8 = 3 Ableton beats)
    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 3,
          duration: 0.5,
          velocity: 100,
          probability: 1,
          velocity_deviation: 0,
        },
      ],
    });

    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result.timeSignature).toBe("6/8");
    expect(result.notes).toBe("1:1 C3 2:1 D3");
  });

  it("should parse notes using clip's current time signature when timeSignature not provided", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 3, // 3/4 time
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "clip1",
      notes: "1:1 C3 2:1 D3", // Should parse with 3 beats per bar
    });

    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 3, // Beat 3 in 3/4 time
          duration: 1,
          velocity: 100,
          probability: 1,
          velocity_deviation: 0,
        },
      ],
    });

    expect(result.notes).toBe("1:1 C3 2:1 D3");
  });

  it("should handle complex drum pattern with real BarBeat parsing", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "clip1",
      notes: "1:1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1:1.5 p0.6 Gb1 1:2 v90 p1.0 D1 v100 p0.9 Gb1",
    });

    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        { pitch: 36, start_time: 0, duration: 0.25, velocity: 100, probability: 1.0, velocity_deviation: 0 },
        { pitch: 42, start_time: 0, duration: 0.25, velocity: 80, probability: 0.8, velocity_deviation: 20 },
        { pitch: 42, start_time: 0.5, duration: 0.25, velocity: 80, probability: 0.6, velocity_deviation: 20 },
        { pitch: 38, start_time: 1, duration: 0.25, velocity: 90, probability: 1.0, velocity_deviation: 0 },
        { pitch: 42, start_time: 1, duration: 0.25, velocity: 100, probability: 0.9, velocity_deviation: 0 },
      ],
    });

    expect(result.notes).toBe("1:1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1:1.5 p0.6 Gb1 1:2 v90 p1.0 D1 v100 p0.9 Gb1");
  });

  it("should throw error for invalid time signature format", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    expect(() =>
      updateClip({
        ids: "clip1",
        timeSignature: "invalid",
      })
    ).toThrow("Time signature must be in format");
  });

  it("should handle 'id ' prefixed clip IDs", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "id clip1",
      name: "Prefixed ID Clip",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Prefixed ID Clip");
    expect(result).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Prefixed ID Clip",
    });
  });

  it("should not update properties when not provided", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "clip1",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(2);
    expect(liveApiSet).toHaveBeenNthCalledWith(1, "name", "Only Name Update");
    expect(liveApiSet).toHaveBeenNthCalledWith(2, "detail_clip", "id clip1");

    expect(liveApiCall).not.toHaveBeenCalledWith("remove_notes_extended", expect.anything());
    expect(liveApiCall).not.toHaveBeenCalledWith("add_new_notes", expect.anything());

    expect(result).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Only Name Update",
    });
  });

  it("should handle boolean false values correctly", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "clip1",
      loop: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("looping", false);
    expect(result).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      loop: false,
    });
  });

  it("should throw error when any clip ID in comma-separated list doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id clip1":
          return "clip1";
        case "id nonexistent":
          return "id 0";
        default:
          return "id 0";
      }
    });

    expect(() => updateClip({ ids: "clip1, nonexistent", name: "Test" })).toThrow(
      'updateClip failed: clip with id "nonexistent" does not exist'
    );
  });

  it("should throw error when clip path cannot be parsed", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") return "invalid_path";
      return "";
    });

    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    expect(() => updateClip({ ids: "clip1", name: "Test" })).toThrow(
      'updateClip failed: could not determine trackIndex for id "clip1" (path="invalid_path")'
    );
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      clip2: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const singleResult = updateClip({ ids: "clip1", name: "Single" });
    const arrayResult = updateClip({ ids: "clip1, clip2", name: "Multiple" });

    expect(singleResult).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Single",
    });
    expect(arrayResult).toEqual([
      {
        id: "clip1",
        type: "midi",
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        name: "Multiple",
      },
      {
        id: "clip2",
        type: "midi",
        view: "Session",
        trackIndex: 1,
        clipSlotIndex: 1,
        name: "Multiple",
      },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      clip2: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      clip3: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 8.0,
      },
    });

    const result = updateClip({
      ids: " clip1 , clip2 , clip3 ",
      color: "#0000FF",
    });

    expect(result).toEqual([
      {
        id: "clip1",
        type: "midi",
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        color: "#0000FF",
      },
      {
        id: "clip2",
        type: "midi",
        view: "Session",
        trackIndex: 1,
        clipSlotIndex: 1,
        color: "#0000FF",
      },
      {
        id: "clip3",
        type: "midi",
        view: "Arranger",
        trackIndex: 2,
        arrangerStartTime: 8.0,
        color: "#0000FF",
      },
    ]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      clip2: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "clip1,,clip2,  ,",
      name: "Filtered",
    });

    // set the names of the two clips, and display the clip detail view:
    expect(liveApiSet).toHaveBeenCalledTimes(3);
    expect(liveApiSet).toHaveBeenNthCalledWith(1, "name", "Filtered");
    expect(liveApiSet).toHaveBeenNthCalledWith(2, "detail_clip", "id clip1");
    expect(liveApiSet).toHaveBeenNthCalledWith(3, "name", "Filtered");

    expect(result).toEqual([
      {
        id: "clip1",
        type: "midi",
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        name: "Filtered",
      },
      {
        id: "clip2",
        type: "midi",
        view: "Session",
        trackIndex: 1,
        clipSlotIndex: 1,
        name: "Filtered",
      },
    ]);
  });

  it("should filter out v0 notes when updating clips", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "clip1",
      notes: "1:1 v100 C3 v0 D3 v80 E3", // D3 should be filtered out
    });

    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        { pitch: 60, start_time: 0, duration: 1, velocity: 100, probability: 1.0, velocity_deviation: 0 },
        { pitch: 64, start_time: 0, duration: 1, velocity: 80, probability: 1.0, velocity_deviation: 0 },
      ],
    });

    expect(result.notes).toBe("1:1 v100 C3 v0 D3 v80 E3"); // Original notation preserved in result
  });

  it("should handle clips with all v0 notes filtered out during update", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    updateClip({
      ids: "clip1",
      notes: "1:1 v0 C3 D3 E3", // All notes should be filtered out
    });

    expect(liveApiCall).toHaveBeenCalledWith("remove_notes_extended", 0, 127, 0, 1000000);
    expect(liveApiCall).not.toHaveBeenCalledWith("add_new_notes", expect.anything());
  });
});
