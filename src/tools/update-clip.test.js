// src/tools/update-clip.test.js
import { describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import * as notation from "../notation/notation";
import { updateClip } from "./update-clip";

// Spy on notation functions
const parseNotationSpy = vi.spyOn(notation, "parseNotation");

describe("updateClip", () => {
  beforeEach(() => {
    parseNotationSpy.mockReturnValue([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 },
    ]);

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

  afterEach(() => {
    parseNotationSpy.mockClear();
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
      notes: "1:1 C3 D3 E3",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Updated Clip");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("looping", true);
    expect(liveApiCall).toHaveBeenCalledWith("remove_notes_extended", 0, 127, 0, 1000000);
    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: expect.arrayContaining([
        expect.objectContaining({ pitch: 60, start_time: 0, duration: 1, velocity: 100 }),
        expect.objectContaining({ pitch: 62, start_time: 0, duration: 1, velocity: 100 }),
        expect.objectContaining({ pitch: 64, start_time: 0, duration: 1, velocity: 100 }),
      ]),
    });

    expect(result).toEqual({
      id: "clip1",
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Updated Clip",
      color: "#FF0000",
      loop: true,
      notes: "1:1 C3 D3 E3",
    });
  });

  it("should update a single arranger clip by ID", () => {
    mockLiveApiGet({
      clip3: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 16.0,
      },
    });

    const result = updateClip({
      ids: "clip3",
      name: "Arranger Clip",
      startMarker: 2,
      endMarker: 6,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Arranger Clip");
    expect(liveApiSet).toHaveBeenCalledWith("start_marker", 2);
    expect(liveApiSet).toHaveBeenCalledWith("end_marker", 6);

    expect(result).toEqual({
      id: "clip3",
      type: "midi",
      view: "Arranger",
      trackIndex: 2,
      arrangerStartTime: 16.0,
      name: "Arranger Clip",
      startMarker: 2,
      endMarker: 6,
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
    expect(liveApiSet).toHaveBeenCalledTimes(4); // 2 calls per clip

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

    expect(liveApiSet).toHaveBeenCalledWith("name", "Only Name Update");
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(parseNotationSpy).not.toHaveBeenCalled();
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

    expect(liveApiSet).toHaveBeenCalledTimes(2); // Only 2 valid IDs
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

  it("should replace existing notes when notes parameter is provided", () => {
    // Restore real parseNotation for this test
    parseNotationSpy.mockRestore();

    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    updateClip({
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
        },
        {
          pitch: 74,
          velocity: 120,
          start_time: 2,
          duration: 1,
        },
      ],
    });
  });

  it("should not call parseNotation when notes parameter is not provided", () => {
    mockLiveApiGet({
      clip1: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    updateClip({
      ids: "clip1",
      name: "Only Name Update",
    });

    expect(parseNotationSpy).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalledWith("remove_notes_extended", expect.anything());
    expect(liveApiCall).not.toHaveBeenCalledWith("add_new_notes", expect.anything());
  });
});
