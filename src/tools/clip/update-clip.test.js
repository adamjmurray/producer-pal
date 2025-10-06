import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../test/mock-live-api";
import { updateClip } from "./update-clip";

describe("updateClip", () => {
  beforeEach(() => {
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
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateClip({})).toThrow("updateClip failed: ids is required");
    expect(() => updateClip({ name: "Test" })).toThrow(
      "updateClip failed: ids is required",
    );
  });

  it("should require noteUpdateMode parameter when notes are provided", () => {
    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Should work without noteUpdateMode when no notes provided
    expect(() => updateClip({ ids: "123", name: "Test" })).not.toThrow();

    // Should fail validation at MCP level when notes provided without noteUpdateMode
    // This will be caught by the zod schema validation in the MCP server
  });

  it("should throw error when clip ID doesn't exist", () => {
    liveApiId.mockReturnValue("0");
    expect(() => updateClip({ ids: "nonexistent" })).toThrow(
      'updateClip failed: clip with id "nonexistent" does not exist',
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
      loop: true,
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

    expect(result).toEqual({
      id: "123",
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      name: "Updated Clip",
      color: "#FF0000",
      loop: true,
    });
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
      startMarker: "1|3", // 2 beats = bar 1 beat 3 in 4/4
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
    ); // startMarker (2) + length (4) = 6 Ableton beats

    expect(result).toEqual({
      id: "789",
      type: "midi",
      view: "arrangement",
      trackIndex: 2,
      arrangementStartTime: 16.0,
      name: "Arrangement Clip",
      startMarker: "1|3",
      length: "1:0",
    });
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
      loop: false,
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

    expect(result).toEqual([
      {
        id: "123",
        type: "midi",
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        color: "#00FF00",
        loop: false,
      },
      {
        id: "456",
        type: "audio",
        view: "session",
        trackIndex: 1,
        sceneIndex: 1,
        color: "#00FF00",
        loop: false,
      },
    ]);
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
    expect(result.timeSignature).toBe("6/8");
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
      notes: "1|1 v80 t2 C4 1|3 v120 t1 D4",
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      127,
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

    expect(result).toEqual({
      id: "123",
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 2,
    });
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
      notes: "1|1 C3 2|1 D3",
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
    expect(result.timeSignature).toBe("6/8");
    expect(result.noteCount).toBe(2);
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
      notes: "1|1 C3 2|1 D3", // Should parse with 3 beats per bar
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

    expect(result.noteCount).toBe(2);
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
        "1|1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1.5 p0.6 Gb1 1|2 v90 p1.0 D1 v100 p0.9 Gb1",
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

    expect(result.noteCount).toBe(5);
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
    expect(result).toEqual({
      id: "123",
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      name: "Prefixed ID Clip",
    });
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

    expect(result).toEqual({
      id: "123",
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      name: "Only Name Update",
    });
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
      loop: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "looping",
      false,
    );
    expect(result).toEqual({
      id: "123",
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      loop: false,
    });
  });

  it("should throw error when any clip ID in comma-separated list doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "0";
        default:
          // make default mocks appear to not exist:
          return "0";
      }
    });

    expect(() => updateClip({ ids: "123, nonexistent", name: "Test" })).toThrow(
      'updateClip failed: clip with id "nonexistent" does not exist',
    );
  });

  it("should throw error when clip path cannot be parsed", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "123") return "invalid_path";
      return this._path;
    });

    mockLiveApiGet({
      123: {
        is_arrangement_clip: 0,
        is_midi_clip: 1,
      },
    });

    expect(() => updateClip({ ids: "123", name: "Test" })).toThrow(
      'updateClip failed: could not determine trackIndex for id "123" (path="invalid_path")',
    );
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

    expect(singleResult).toEqual({
      id: "123",
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      name: "Single",
    });
    expect(arrayResult).toEqual([
      {
        id: "123",
        type: "midi",
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        name: "Multiple",
      },
      {
        id: "456",
        type: "midi",
        view: "session",
        trackIndex: 1,
        sceneIndex: 1,
        name: "Multiple",
      },
    ]);
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

    expect(result).toEqual([
      {
        id: "123",
        type: "midi",
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        color: "#0000FF",
      },
      {
        id: "456",
        type: "midi",
        view: "session",
        trackIndex: 1,
        sceneIndex: 1,
        color: "#0000FF",
      },
      {
        id: "789",
        type: "midi",
        view: "arrangement",
        trackIndex: 2,
        arrangementStartTime: 8.0,
        color: "#0000FF",
      },
    ]);
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

    expect(result).toEqual([
      {
        id: "123",
        type: "midi",
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        name: "Filtered",
      },
      {
        id: "456",
        type: "midi",
        view: "session",
        trackIndex: 1,
        sceneIndex: 1,
        name: "Filtered",
      },
    ]);
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
      notes: "1|1 v100 C3 v0 D3 v80 E3", // D3 should be filtered out
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

    expect(result.noteCount).toBe(2); // C3 and E3, D3 filtered out
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
      notes: "1|1 v0 C3 D3 E3", // All notes should be filtered out
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      127,
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
      notes: "1|1 C3",
      noteUpdateMode: "replace",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      127,
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

    expect(result.noteCount).toBe(1);
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

    const result = updateClip({
      ids: "123",
      notes: "1|1 C3",
      noteUpdateMode: "merge",
    });

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
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

    expect(result.noteCount).toBe(1);
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

    updateClip({
      ids: "123",
      notes: "1|1 v0 C3", // All notes filtered out
      noteUpdateMode: "merge",
    });

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
    );
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should set loop start when provided", () => {
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
      loopStart: "1|3",
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
    liveApiCall.mockImplementation(function (method, ...args) {
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
      notes: "1|1 v0 C3 v100 F3", // Delete C3 at 1|1, add F3 at 1|1
      noteUpdateMode: "merge",
    });

    // Should call get_notes_extended to read existing notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "get_notes_extended",
      0,
      127,
      0,
      1000000,
    );

    // Should remove all notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      127,
      0,
      1000000,
    );

    // Should add back filtered existing notes plus new regular notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          // Existing notes minus the deleted C3 at 1|1 (cleaned for Live API)
          {
            pitch: 62,
            start_time: 1,
            duration: 1,
            velocity: 80,
            probability: 1,
            velocity_deviation: 0,
          }, // D3 at 1|2
          {
            pitch: 64,
            start_time: 0,
            duration: 1,
            velocity: 90,
            probability: 1,
            velocity_deviation: 0,
          }, // E3 at 1|1
          // New F3 note
          {
            pitch: 65,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result.noteCount).toBe(3); // 2 existing (D3, E3) + 1 new (F3), C3 deleted
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
    liveApiCall.mockImplementation(function (method, ...args) {
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
      notes: "1|1 v0 C3", // Try to delete C3 at 1|1 (doesn't exist)
      noteUpdateMode: "merge",
    });

    // Should still read existing notes and remove/add them back
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "get_notes_extended",
      0,
      127,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "remove_notes_extended",
      0,
      127,
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

  it("should not call get_notes_extended when noteUpdateMode is 'merge' but no v0 notes", () => {
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
      notes: "1|1 v100 C3", // No v0 notes
      noteUpdateMode: "merge",
    });

    // Should not call get_notes_extended since no v0 notes
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "get_notes_extended",
      expect.anything(),
    );
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
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
});
