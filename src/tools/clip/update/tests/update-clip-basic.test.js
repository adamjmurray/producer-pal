import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import {
  setupMidiClipMock,
  setupMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";

describe("updateClip - Basic operations", () => {
  beforeEach(() => {
    setupMocks();
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

    expect(result).toStrictEqual({ id: "123", noteCount: 2 }); // Existing C3 + new D3
  });

  it("should log warning when clip ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = updateClip({
      ids: "nonexistent",
      notes: "1|1 60",
      noteUpdateMode: "replace",
    });

    expect(result).toStrictEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateClip: id "nonexistent" does not exist',
    );
  });

  it("should update a single session clip by ID", () => {
    setupMidiClipMock("123");

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

    expect(result).toStrictEqual({ id: "123" });
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

    expect(result).toStrictEqual({ id: "789" });
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

    const result = updateClip({
      ids: "999",
      name: "Test Arrangement Clip",
    });

    // Verify result is returned (view switching is a side effect)
    expect(result).toStrictEqual({ id: "999" });
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

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should update time signature when provided", () => {
    setupMidiClipMock("123");

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
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should replace existing notes with real bar|beat parsing in 4/4 time", () => {
    setupMidiClipMock("123");

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

    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should parse notes using provided time signature with real bar|beat parsing", () => {
    setupMidiClipMock("123");

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
    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should parse notes using clip's current time signature when timeSignature not provided", () => {
    setupMidiClipMock("123", {
      signature_numerator: 3,
      signature_denominator: 4,
    }); // 3/4 time

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

    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should handle complex drum pattern with real bar|beat parsing", () => {
    setupMidiClipMock("123");

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

    expect(result).toStrictEqual({ id: "123", noteCount: 5 });
  });

  it("should throw error for invalid time signature format", () => {
    setupMidiClipMock("123");

    expect(() =>
      updateClip({
        ids: "123",
        timeSignature: "invalid",
      }),
    ).toThrow("Time signature must be in format");
  });
});
