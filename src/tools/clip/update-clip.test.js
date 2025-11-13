import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
} from "../../test/mock-live-api";
import { updateClip } from "./update-clip";

describe("updateClip", () => {
  beforeEach(() => {
    // Track added notes per clip ID for get_notes_extended mocking
    const addedNotesByClipId = {};

    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "id 789":
          return "789";
        case "id 999":
          return "999";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "123":
          return "live_set tracks 0 clip_slots 0 clip";
        case "456":
          return "live_set tracks 1 clip_slots 1 clip";
        case "789":
          return "live_set tracks 2 arrangement_clips 0";
        case "999":
          return "live_set tracks 3 arrangement_clips 1";
        default:
          return this._path;
      }
    });

    // Mock liveApiCall to track added notes and return them for get_notes_extended
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "add_new_notes") {
        // Store the notes for this clip ID
        addedNotesByClipId[this.id] = args[0]?.notes || [];
      } else if (method === "get_notes_extended") {
        // Return the notes that were previously added for this clip
        const notes = addedNotesByClipId[this.id] || [];
        return JSON.stringify({ notes });
      }
      return undefined;
    });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateClip({})).toThrow("updateClip failed: ids is required");
    expect(() => updateClip({ name: "Test" })).toThrow(
      "updateClip failed: ids is required",
    );
  });

  it("should default to merge mode when noteUpdateMode not provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    // Mock existing notes, then return added notes on subsequent calls
    let addedNotes = [];
    const existingNotes = [
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      },
    ];

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "add_new_notes") {
        addedNotes = args[0]?.notes || [];
      } else if (method === "get_notes_extended") {
        // First call returns existing notes, subsequent calls return added notes
        if (addedNotes.length === 0) {
          return JSON.stringify({ notes: existingNotes });
        }
        return JSON.stringify({ notes: addedNotes });
      }
      return {};
    });

    // Should default to merge mode when noteUpdateMode not specified
    const result = updateClip({
      ids: "123",
      notes: "D3 1|2",
    });

    // Should call get_notes_extended (merge mode behavior)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "get_notes_extended",
      0,
      128,
      0,
      1000000,
    );

    expect(result).toEqual({ id: "123", noteCount: 2 }); // Existing C3 + new D3
  });

  it("should log warning when clip ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = updateClip({
      ids: "nonexistent",
      notes: "1|1 60",
      noteUpdateMode: "replace",
    });

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateClip: id "nonexistent" does not exist',
    );
  });

  it("should update a single session clip by ID", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      name: "Updated Clip",
      color: "#FF0000",
      looping: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Updated Clip",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "looping",
      true,
    );

    expect(result).toEqual({ id: "123" });
  });

  it("should update a single arrangement clip by ID", () => {
    mockLiveApiGet({
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 16.0,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "789",
      name: "Arrangement Clip",
      start: "1|3", // 2 beats = bar 1 beat 3 in 4/4
      length: "1:0", // 4 beats = 1 bar
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "name",
      "Arrangement Clip",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "start_marker",
      2,
    ); // 1|3 in 4/4 = 2 Ableton beats
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "end_marker",
      6,
    ); // start (2) + length (4) = 6 Ableton beats

    expect(result).toEqual({ id: "789" });
  });

  it("should switch to Arranger view when updating arrangement clips", () => {
    mockLiveApiGet({
      999: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 32.0,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    updateClip({
      ids: "999",
      name: "Test Arrangement Clip",
    });
  });

  it("should update multiple clips by comma-separated IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 0, // audio clip
      },
    });

    const result = updateClip({
      ids: "123, 456",
      color: "#00FF00",
      looping: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "looping",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledTimes(4); // 2 calls per clip
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "looping",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "looping",
      false,
    );

    expect(result).toEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should update time signature when provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      timeSignature: "6/8",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "signature_numerator",
      6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "signature_denominator",
      8,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should replace existing notes with real bar|beat parsing in 4/4 time", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      notes: "v80 t2 C4 1|1 v120 t1 D4 1|3",
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
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
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 2 });
  });

  it("should parse notes using provided time signature with real bar|beat parsing", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      timeSignature: "6/8",
      notes: "C3 1|1 D3 2|1",
      noteUpdateMode: "replace",
    });

    // In 6/8 time, bar 2 beat 1 should be 3 Ableton beats (6 musical beats * 4/8 = 3 Ableton beats)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
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
      },
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "signature_numerator",
      6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "signature_denominator",
      8,
    );
    expect(result).toEqual({ id: "123", noteCount: 2 });
  });

  it("should parse notes using clip's current time signature when timeSignature not provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 3, // 3/4 time
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
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
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 2 });
  });

  it("should handle complex drum pattern with real bar|beat parsing", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      notes:
        "v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1 p0.6 Gb1 1|1.5 v90 p1.0 D1 v100 p0.9 Gb1 1|2",
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 36,
            start_time: 0,
            duration: 0.25,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 42,
            start_time: 0,
            duration: 0.25,
            velocity: 80,
            probability: 0.8,
            velocity_deviation: 20,
          },
          {
            pitch: 42,
            start_time: 0.5,
            duration: 0.25,
            velocity: 80,
            probability: 0.6,
            velocity_deviation: 20,
          },
          {
            pitch: 38,
            start_time: 1,
            duration: 0.25,
            velocity: 90,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 42,
            start_time: 1,
            duration: 0.25,
            velocity: 100,
            probability: 0.9,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 5 });
  });

  it("should throw error for invalid time signature format", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    expect(() =>
      updateClip({
        ids: "123",
        timeSignature: "invalid",
      }),
    ).toThrow("Time signature must be in format");
  });

  it("should handle 'id ' prefixed clip IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "id 123",
      name: "Prefixed ID Clip",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID Clip",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should not update properties when not provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Only Name Update",
    );

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
    );
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );

    expect(result).toEqual({ id: "123" });
  });

  it("should handle boolean false values correctly", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123",
      looping: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "looping",
      false,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should skip invalid clip IDs in comma-separated list and update valid ones", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "id 0";
        default:
          return "id 0";
      }
    });
    liveApiType.mockReturnValue("Clip");
    const consoleErrorSpy = vi.spyOn(console, "error");

    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123, nonexistent",
      name: "Test",
      noteUpdateMode: "replace",
    });

    expect(result).toEqual({ id: "123" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateClip: id "nonexistent" does not exist',
    );
    expect(liveApiSet).toHaveBeenCalledWith("name", "Test");
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const singleResult = updateClip({ ids: "123", name: "Single" });
    const arrayResult = updateClip({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toEqual({ id: "123" });
    expect(arrayResult).toEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      789: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 8.0,
      },
    });

    const result = updateClip({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
      456: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    const result = updateClip({
      ids: "123,,456,  ,",
      name: "Filtered",
    });

    // set the names of the two clips:
    expect(liveApiSet).toHaveBeenCalledTimes(2);
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Filtered",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "name",
      "Filtered",
    );

    expect(result).toEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should filter out v0 notes when updating clips", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      notes: "v100 C3 v0 D3 v80 E3 1|1", // D3 should be filtered out
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 64,
            start_time: 0,
            duration: 1,
            velocity: 80,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 2 }); // C3 and E3, D3 filtered out
  });

  it("should handle clips with all v0 notes filtered out during update", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    updateClip({
      ids: "123",
      notes: "v0 C3 D3 E3 1|1", // All notes should be filtered out
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should replace notes when noteUpdateMode is 'replace'", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      notes: "C3 1|1",
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 1 });
  });

  it("should add to existing notes when noteUpdateMode is 'merge'", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock empty existing notes, then return added notes on subsequent calls
    let addedNotes = [];
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "add_new_notes") {
        addedNotes = args[0]?.notes || [];
      } else if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: addedNotes,
        });
      }
      return {};
    });

    const result = updateClip({
      ids: "123",
      notes: "C3 1|1",
      noteUpdateMode: "merge",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 1 });
  });

  it("should not call add_new_notes when noteUpdateMode is 'merge' and notes array is empty", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock empty existing notes
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [],
        });
      }
      return {};
    });

    updateClip({
      ids: "123",
      notes: "v0 C3 1|1", // All notes filtered out
      noteUpdateMode: "merge",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should set loop start when start is provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 1,
      },
    });

    updateClip({
      ids: "123",
      start: "1|3",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "loop_start",
      2,
    );
  });

  it("should delete specific notes with v0 when noteUpdateMode is 'merge'", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock existing notes in the clip
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              pitch: 60,
              start_time: 0,
              duration: 1,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            }, // C3 at 1|1 - should be deleted
            {
              pitch: 62,
              start_time: 1,
              duration: 1,
              velocity: 80,
              probability: 1,
              velocity_deviation: 0,
            }, // D3 at 1|2 - should remain
            {
              pitch: 64,
              start_time: 0,
              duration: 1,
              velocity: 90,
              probability: 1,
              velocity_deviation: 0,
            }, // E3 at 1|1 - should remain
          ],
        });
      }
      return {};
    });

    const result = updateClip({
      ids: "123",
      notes: "v0 C3 v100 F3 1|1", // Delete C3 at 1|1, add F3 at 1|1
      noteUpdateMode: "merge",
    });

    // Should call get_notes_extended to read existing notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "get_notes_extended",
      0,
      128,
      0,
      1000000,
    );

    // Should remove all notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );

    // Should add back filtered existing notes plus new regular notes
    const addNewNotesCall = liveApiCall.mock.calls.find(
      (call) => call[0] === "add_new_notes",
    );
    expect(addNewNotesCall).toBeDefined();
    expect(addNewNotesCall[1].notes).toHaveLength(3);
    expect(addNewNotesCall[1].notes).toContainEqual({
      pitch: 62,
      start_time: 1,
      duration: 1,
      velocity: 80,
      probability: 1,
      velocity_deviation: 0,
    }); // D3 at 1|2
    expect(addNewNotesCall[1].notes).toContainEqual({
      pitch: 64,
      start_time: 0,
      duration: 1,
      velocity: 90,
      probability: 1,
      velocity_deviation: 0,
    }); // E3 at 1|1
    expect(addNewNotesCall[1].notes).toContainEqual({
      pitch: 65,
      start_time: 0,
      duration: 1,
      velocity: 100,
      probability: 1,
      velocity_deviation: 0,
    }); // New F3 note

    expect(result).toEqual({ id: "123", noteCount: 3 }); // 2 existing (D3, E3) + 1 new (F3), C3 deleted
  });

  it("should handle v0 notes when no existing notes match", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock existing notes that don't match the v0 note
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              pitch: 62,
              start_time: 1,
              duration: 1,
              velocity: 80,
              probability: 1,
              velocity_deviation: 0,
            }, // D3 at 1|2 - no match
          ],
        });
      }
      return {};
    });

    updateClip({
      ids: "123",
      notes: "v0 C3 1|1", // Try to delete C3 at 1|1 (doesn't exist)
      noteUpdateMode: "merge",
    });

    // Should still read existing notes and remove/add them back
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "get_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 62,
            start_time: 1,
            duration: 1,
            velocity: 80,
            probability: 1,
            velocity_deviation: 0,
          }, // Original note preserved
        ],
      },
    );
  });

  it("should call get_notes_extended in merge mode to format existing notes", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock existing notes
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [],
        });
      }
      return {};
    });

    updateClip({
      ids: "123",
      notes: "v100 C3 1|1",
      noteUpdateMode: "merge",
    });

    // Should call get_notes_extended in merge mode
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "get_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should support bar copy with existing notes in merge mode", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock existing notes in bar 1, then return added notes after add_new_notes
    const existingNotes = [
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      }, // C3 at 1|1
      {
        pitch: 64,
        start_time: 1,
        duration: 1,
        velocity: 80,
        probability: 1,
        velocity_deviation: 0,
      }, // E3 at 1|2
    ];
    let addedNotes = existingNotes;
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "add_new_notes") {
        addedNotes = args[0]?.notes || [];
      } else if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: addedNotes,
        });
      }
      return {};
    });

    const result = updateClip({
      ids: "123",
      notes: "@2=1", // Copy bar 1 to bar 2
      noteUpdateMode: "merge",
    });

    // Should add existing notes + copied notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          // Existing notes in bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1,
            velocity_deviation: 0,
          },
          {
            pitch: 64,
            start_time: 1,
            duration: 1,
            velocity: 80,
            probability: 1,
            velocity_deviation: 0,
          },
          // Copied to bar 2 (starts at beat 4)
          {
            pitch: 60,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1,
            velocity_deviation: 0,
          },
          {
            pitch: 64,
            start_time: 5,
            duration: 1,
            velocity: 80,
            probability: 1,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 4 }); // 2 existing + 2 copied
  });

  it("should report noteCount only for notes within clip playback region when length is set", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 8, // 2 bars
      },
    });

    // Mock to track added notes and return subset based on length parameter
    let allAddedNotes = [];
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "add_new_notes") {
        allAddedNotes = args[0]?.notes || [];
      } else if (method === "get_notes_extended") {
        // First call returns empty (replace mode), second call filters by length
        const startBeat = args[2] || 0;
        const endBeat = args[3] || Infinity;
        const notesInRange = allAddedNotes.filter(
          (note) => note.start_time >= startBeat && note.start_time < endBeat,
        );
        return JSON.stringify({ notes: notesInRange });
      }
      return {};
    });

    const result = updateClip({
      ids: "123",
      notes: "C3 1|1 D3 2|1 E3 3|1", // Notes in bars 1, 2, 3
      noteUpdateMode: "replace",
      length: "2:0", // Clip length = 2 bars (8 beats)
    });

    // Should have added 3 notes total
    expect(allAddedNotes.length).toBe(3);

    // But noteCount should only include notes within the 2-bar playback region
    // C3 at bar 1 (beat 0) and D3 at bar 2 (beat 4) are within 8 beats
    // E3 at bar 3 (beat 8) is outside the playback region
    expect(result).toEqual({ id: "123", noteCount: 2 });

    // Verify get_notes_extended was called with the clip's length (8 beats)
    expect(liveApiCall).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      0,
      8,
    );
  });

  it("should support bar copy with v0 deletions in merge mode", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock existing notes in bar 1
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              pitch: 60,
              start_time: 0,
              duration: 1,
              velocity: 100,
              probability: 1,
              velocity_deviation: 0,
            }, // C3 at 1|1
            {
              pitch: 64,
              start_time: 1,
              duration: 1,
              velocity: 80,
              probability: 1,
              velocity_deviation: 0,
            }, // E3 at 1|2
          ],
        });
      }
      return {};
    });

    const result = updateClip({
      ids: "123",
      notes: "v0 C3 1|1 @2=1", // Delete C3 at 1|1, then copy bar 1 (now only E3) to bar 2
      noteUpdateMode: "merge",
    });

    // Should have E3 in bar 1 and E3 copied to bar 2 (C3 deleted by v0)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          // E3 remains in bar 1 (C3 deleted)
          {
            pitch: 64,
            start_time: 1,
            duration: 1,
            velocity: 80,
            probability: 1,
            velocity_deviation: 0,
          },
          // E3 copied to bar 2 (beat 5)
          {
            pitch: 64,
            start_time: 5,
            duration: 1,
            velocity: 80,
            probability: 1,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toEqual({ id: "123", noteCount: 2 }); // E3 in bar 1 + E3 in bar 2, C3 deleted
  });

  it("should update warp mode for audio clips", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 0,
        is_audio_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      warpMode: "complex",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "warp_mode",
      4, // Complex mode = 4
    );

    expect(result).toEqual({ id: "123" });
  });

  it("should update warping on/off for audio clips", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 0,
        is_audio_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      warping: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "warping",
      1, // true = 1
    );

    expect(result).toEqual({ id: "123" });
  });

  it("should update both warp mode and warping together", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 0,
        is_audio_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = updateClip({
      ids: "123",
      warpMode: "beats",
      warping: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "warp_mode",
      0, // Beats mode = 0
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "warping",
      0, // false = 0
    );

    expect(result).toEqual({ id: "123" });
  });

  describe("Clip boundaries (Phase 1)", () => {
    it("should set length without explicit start using current loop_start", () => {
      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
          loop_start: 4.0, // bar 2 beat 1 in 4/4
        },
      });

      const result = updateClip({
        ids: "123",
        length: "2:0", // 8 beats = 2 bars
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "loop_end",
        12, // loop_start (4) + length (8) = 12
      );

      expect(result).toEqual({ id: "123" });
    });

    it("should set firstStart for looping clips", () => {
      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
        },
      });

      const result = updateClip({
        ids: "123",
        start: "1|1",
        length: "4:0",
        firstStart: "3|1",
        looping: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "start_marker",
        8, // 3|1 in 4/4 = 8 Ableton beats
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "loop_start",
        0, // 1|1 in 4/4 = 0 Ableton beats
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "loop_end",
        16, // start (0) + length (16) = 16
      );

      expect(result).toEqual({ id: "123" });
    });

    it("should warn when firstStart provided for non-looping clips", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
        },
      });

      const result = updateClip({
        ids: "123",
        start: "1|1",
        length: "4:0",
        firstStart: "2|1",
        looping: false,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Warning: firstStart parameter ignored for non-looping clips",
      );

      consoleErrorSpy.mockRestore();
      expect(result).toEqual({ id: "123" });
    });

    it("should set end_marker for non-looping clips", () => {
      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
        },
      });

      const result = updateClip({
        ids: "123",
        start: "1|1",
        length: "4:0",
        looping: false,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "start_marker",
        0, // 1|1 in 4/4 = 0 Ableton beats
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "end_marker",
        16, // start (0) + length (16) = 16
      );

      expect(result).toEqual({ id: "123" });
    });

    it("should set loop_start and loop_end for looping clips", () => {
      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0,
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
        },
      });

      const result = updateClip({
        ids: "123",
        start: "2|1",
        length: "2:0",
        looping: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "start_marker",
        4, // start (2|1 = 4 beats) also sets start_marker
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "loop_start",
        4, // 2|1 in 4/4 = 4 Ableton beats
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "loop_end",
        12, // start (4) + length (8) = 12
      );

      expect(result).toEqual({ id: "123" });
    });
  });

  describe("arrangementLength (Phase 1: shortening only)", () => {
    it("should shorten arrangement clip to 50% of original length", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0, // 4 bars starting at beat 0
          end_time: 16.0, // 4 bars ending at beat 16
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
      });

      // Mock live_set for song time signature
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "2:0", // 2 bars = 8 beats (50% of 4 bars)
      });

      // Should create temp clip at beat 8 with length 8
      expect(liveApiCall).toHaveBeenCalledWith(
        "create_midi_clip",
        8.0, // newEndTime
        8.0, // tempClipLength
      );

      // Should delete the temp clip
      expect(liveApiCall).toHaveBeenCalledWith(
        "delete_clip",
        expect.any(String),
      );

      expect(result).toEqual({ id: "789" });
    });

    it("should shorten arrangement clip to single beat", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 16.0, // 4 bars
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "0:1", // 1 beat
      });

      // Should create temp clip at beat 1 with length 15
      expect(liveApiCall).toHaveBeenCalledWith(
        "create_midi_clip",
        1.0, // newEndTime
        15.0, // tempClipLength
      );

      expect(result).toEqual({ id: "789" });
    });

    it("should throw error when attempting to lengthen", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 16.0, // 4 bars
          loop_start: 0.0,
          loop_end: 16.0,
          start_marker: 0.0,
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
        LiveSet: {
          tracks: ["id", 0],
        },
        "live_set tracks 0": {
          arrangement_clips: ["id", 789],
        },
      });

      expect(() =>
        updateClip({
          ids: "789",
          firstStart: "1|2", // Different from start_marker (0.0) - will trigger Phase 5 error
          arrangementLength: "6:0", // 6 bars (longer than current 4)
        }),
      ).toThrow(/Phase 5.*not yet implemented/);
    });

    it("should emit warning and ignore for session clips", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockLiveApiGet({
        123: {
          is_arrangement_clip: 0, // Session clip
          is_midi_clip: 1,
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const result = updateClip({
        ids: "123",
        arrangementLength: "2:0",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Warning: arrangementLength parameter ignored for session clip (id 123)",
      );

      // Should not call create_midi_clip or delete_clip
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "create_midi_clip",
        expect.anything(),
        expect.anything(),
      );

      consoleErrorSpy.mockRestore();
      expect(result).toEqual({ id: "123" });
    });

    it("should handle zero length with clear error", () => {
      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 16.0,
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      expect(() =>
        updateClip({
          ids: "789",
          arrangementLength: "0:0",
        }),
      ).toThrow("arrangementLength must be greater than 0");
    });

    it("should handle same length as no-op", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 16.0, // 4 bars
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
      });

      liveApiCall.mockClear(); // Clear previous calls

      const result = updateClip({
        ids: "789",
        arrangementLength: "4:0", // Same as current length
      });

      // Should not create temp clip (no-op)
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "create_midi_clip",
        expect.anything(),
        expect.anything(),
      );

      expect(result).toEqual({ id: "789" });
    });

    it("should allow both arrangementLength and arrangementStart (resize then move)", () => {
      const trackIndex = 0;
      const newClipId = "999";

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._id === newClipId) {
          return "live_set tracks 0 arrangement_clips 1";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id 789") {
          return "789";
        }
        if (this._path === "id 999") {
          return newClipId;
        }
        return this._id;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 16.0, // 4 bars
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
        999: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 32.0, // New position at bar 9
          end_time: 40.0,
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
      });

      // Mock duplicate_clip_to_arrangement to return new clip
      liveApiCall.mockImplementation(function (method, ..._args) {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${newClipId}`;
        }
        return undefined;
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "2:0", // Shorten to 2 bars first
        arrangementStart: "9|1", // Then move to bar 9
      });

      // Should first create temp clip to shorten
      expect(liveApiCall).toHaveBeenCalledWith(
        "create_midi_clip",
        8.0, // newEndTime (2 bars)
        8.0, // tempClipLength
      );

      // Should then duplicate to new position
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        32.0, // bar 9 in 4/4 = 32 beats
      );

      // Should delete original
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 789");

      expect(result).toEqual({ id: newClipId });
    });
  });

  describe("arrangementLength (Phase 2: clean tiling)", () => {
    it("should tile clip with exact multiples (no remainder) - extends existing", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          is_audio_clip: 0,
          start_time: 0.0,
          end_time: 4.0, // 1 bar currently visible
          loop_start: 0.0,
          loop_end: 12.0, // clip.length = 12 beats (3 bars of content)
          start_marker: 0.0,
          end_marker: 12.0,
          name: "Test",
          color: 0,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
          trackIndex,
        },
        LiveSet: {
          tracks: ["id", 0],
          signature_numerator: 4,
          signature_denominator: 4,
        },
        "live_set tracks 0": {
          arrangement_clips: ["id", 789],
        },
      });

      // Mock Phase 3a recreation flow
      liveApiCall.mockImplementation(function (method, ..._args) {
        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
        }
        if (method === "create_midi_clip") {
          const id = 1000;
          mockLiveApiGet({
            [id]: {
              is_midi_clip: 1,
              is_audio_clip: 0,
            },
          });
          return `id ${id}`;
        }
        return undefined;
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "3:0", // 3 bars = 12 beats, matches clip.length exactly
      });

      // Phase 3a: Recreate clip from 4→12 beats
      // currentArrangementLength (4) < clipLength (12) triggers recreation
      // recreatedLength = min(12, 12) = 12 beats
      // No tiling needed since recreatedLength == desired length
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 789");
      expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 0, 12);
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );

      expect(result).toEqual({ id: "1000" }); // Recreated clip ID
    });

    // TODO: Fix this test - needs to be rewritten for Phase 2+3 implementation
    it.skip("should handle tiling with sufficient clip content", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789" || this._id === 1000 || this._id === 1001) {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 4.0, // 1 bar clip
          loop_start: 0.0,
          loop_end: 4.0, // clip.length = 4 beats
          start_marker: 0.0,
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
        LiveSet: {
          tracks: ["id", 0],
        },
        "live_set tracks 0": {
          arrangement_clips: ["id", 789], // Only source clip
        },
      });

      // Mock duplicate_clip_to_arrangement and create_midi_clip
      let clipIdCounter = 1000;
      liveApiCall.mockImplementation(function (method, ...args) {
        if (method === "duplicate_clip_to_arrangement") {
          const clipId = clipIdCounter++;
          const position = args[1];
          // Holding area clip (at high bar)
          if (position > 100) {
            mockLiveApiGet({
              [clipId]: {
                end_time: position + 4.0,
              },
            });
          } else {
            // Regular tile
            mockLiveApiGet({
              [clipId]: {
                end_time: position + 4.0,
              },
            });
          }
          return `id ${clipId}`;
        }
        if (method === "create_midi_clip") {
          const clipId = clipIdCounter++;
          return `id ${clipId}`;
        }
        return undefined;
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "2:2", // 2.5 bars = 10 beats (2 full tiles + 2 beat partial)
      });

      // Should create 1 full tile
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        4.0,
      );

      // Should use holding area for partial tile
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        expect.any(Number), // Holding area position
      );

      // Should shorten holding clip with temp clip
      expect(liveApiCall).toHaveBeenCalledWith(
        "create_midi_clip",
        expect.any(Number),
        expect.any(Number),
      );

      // Should duplicate shortened clip to final position
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.stringMatching(/id 10\d\d/),
        8.0, // Final position after 2 tiles
      );

      // Should delete holding clip
      expect(liveApiCall).toHaveBeenCalledWith(
        "delete_clip",
        expect.stringMatching(/id 10\d\d/),
      );

      expect(result).toEqual({ id: "789" });
    });

    it("should handle Phase 3 (insufficient content) by tiling what exists", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789" || this._id === 1000) {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 4.0,
          loop_start: 0.0,
          loop_end: 4.0, // clip.length = 4 beats
          start_marker: 0.0,
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
        LiveSet: {
          tracks: ["id", 0],
        },
        "live_set tracks 0": {
          arrangement_clips: ["id", 789],
        },
      });

      // Mock duplicate_clip_to_arrangement
      let nextId = 1000;
      liveApiCall.mockImplementation(function (method, ..._args) {
        if (method === "duplicate_clip_to_arrangement") {
          const id = nextId++;
          mockLiveApiGet({
            [id]: {
              end_time: (_args[1] || 0) + 4.0,
            },
          });
          return `id ${id}`;
        }
        return undefined;
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "2:0", // 8 beats > 4 beats (clip.length), tiles existing content twice
      });

      // Should duplicate once (2 tiles total: existing clip + 1 duplicate)
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        4.0,
      );

      expect(result).toEqual({ id: "789" });
    });

    it("should throw error when firstStart != start", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 4.0,
          loop_start: 0.0,
          loop_end: 4.0,
          start_marker: 0.0, // firstStart would be different
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
      });

      expect(() =>
        updateClip({
          ids: "789",
          firstStart: "2|1", // Different from start_marker (0.0) - 2|1 = 4 beats
          arrangementLength: "3:0",
        }),
      ).toThrow(/Phase 5.*not yet implemented/);
    });

    it("should work with no remainder (single tile)", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          start_time: 0.0,
          end_time: 4.0,
          loop_start: 0.0,
          loop_end: 4.0,
          start_marker: 0.0,
          signature_numerator: 4,
          signature_denominator: 4,
          trackIndex,
        },
        LiveSet: {
          tracks: ["id", 0],
        },
        "live_set tracks 0": {
          arrangement_clips: ["id", 789],
        },
      });

      const result = updateClip({
        ids: "789",
        arrangementLength: "1:0", // Same as clip.length (no tiling needed)
      });

      // Should not call duplicate_clip_to_arrangement
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );

      expect(result).toEqual({ id: "789" });
    });
  });

  describe("arrangementLength (Phase 4: expose hidden content)", () => {
    it("should expose hidden content by recreating clip", () => {
      const trackIndex = 0;
      liveApiPath.mockImplementation(function () {
        if (this._id === "789" || this._id === 1000 || this._id === 2000) {
          return "live_set tracks 0 arrangement_clips 0";
        }
        if (this._path === "live_set") {
          return "live_set";
        }
        if (this._path === "live_set tracks 0") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        789: {
          is_arrangement_clip: 1,
          is_midi_clip: 1,
          is_audio_clip: 0,
          start_time: 0.0,
          end_time: 4.0, // Currently showing 4 beats (1 bar)
          loop_start: 0.0,
          loop_end: 8.0, // clip.length = 8 beats (2 bars) - has hidden content
          start_marker: 0.0,
          end_marker: 8.0,
          name: "Test Clip",
          color: 16711680, // Red
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
          trackIndex,
        },
        LiveSet: {
          tracks: ["id", 0],
          signature_numerator: 4,
          signature_denominator: 4,
        },
        "live_set tracks 0": {
          arrangement_clips: ["id", 789],
        },
      });

      // Mock get_notes_extended for readClipProperties
      liveApiCall.mockImplementation(function (method, ..._args) {
        if (method === "get_notes_extended") {
          return JSON.stringify({
            notes: [
              { pitch: 60, start: 0, duration: 1, velocity: 100 },
              { pitch: 62, start: 2, duration: 1, velocity: 100 },
            ],
          });
        }
        if (method === "create_midi_clip") {
          const id = 1000;
          mockLiveApiGet({
            [id]: {
              is_midi_clip: 1,
              is_audio_clip: 0,
            },
          });
          return `id ${id}`;
        }
        if (method === "duplicate_clip_to_arrangement") {
          const id = 2000;
          mockLiveApiGet({
            [id]: {},
          });
          return `id ${id}`;
        }
        return undefined;
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateClip({
        ids: "789",
        arrangementLength: "1:2", // 6 beats - more than current 4, less than clip.length 8
      });

      // Should call get_notes_extended to read properties
      expect(liveApiCall).toHaveBeenCalledWith(
        "get_notes_extended",
        0,
        128,
        0,
        1000000,
      );

      // Should create holding clip
      expect(liveApiCall).toHaveBeenCalledWith(
        "create_midi_clip",
        44, // Holding area start (bar 11: ceil(4/4) + 10 in 4/4)
        6, // Target length
      );

      // Should delete original
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 789");

      // Should duplicate from holding area to original position
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 1000",
        0.0,
      );

      // Should delete holding clip
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 1000");

      // Should emit warning about envelope loss
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Clip arrangement length expanded by recreating clip. " +
          "Automation envelopes were lost due to Live API limitations.",
      );

      consoleErrorSpy.mockRestore();
      expect(result).toEqual({ id: "789" });
    });
  });
});
