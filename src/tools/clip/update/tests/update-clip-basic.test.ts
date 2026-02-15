// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { createNote } from "#src/test/test-data-builders.ts";
import {
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - Basic operations", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should throw error when ids is missing", async () => {
    await expect(updateClip({})).rejects.toThrow(
      "updateClip failed: ids is required",
    );
    await expect(updateClip({ name: "Test" })).rejects.toThrow(
      "updateClip failed: ids is required",
    );
  });

  it("should default to merge mode when noteUpdateMode not provided", async () => {
    setupMidiClipMock(mocks.clip123, {
      length: 4,
    });

    // Mock existing notes, then return added notes on subsequent calls
    let addedNotes: unknown[] = [];
    const existingNotes = [createNote()];

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
        if (method === "add_new_notes") {
          const arg = args[0] as { notes?: unknown[] } | undefined;

          addedNotes = arg?.notes ?? [];
        } else if (method === "get_notes_extended") {
          // First call returns existing notes, subsequent calls return added notes
          if (addedNotes.length === 0) {
            return JSON.stringify({ notes: existingNotes });
          }

          return JSON.stringify({ notes: addedNotes });
        }

        return {};
      },
    );

    // Should default to merge mode when noteUpdateMode not specified
    const result = await updateClip({
      ids: "123",
      notes: "D3 1|2",
    });

    // Should call get_notes_extended (merge mode behavior)
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      0,
      1000000,
    );

    expect(result).toStrictEqual({ id: "123", noteCount: 2 }); // Existing C3 + new D3
  });

  it("should log warning when clip ID doesn't exist", async () => {
    mockNonExistentObjects();

    const result = await updateClip({
      ids: "nonexistent",
      notes: "1|1 60",
      noteUpdateMode: "replace",
    });

    expect(result).toStrictEqual([]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateClip: id "nonexistent" does not exist',
    );
  });

  it("should update a single session clip by ID", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      name: "Updated Clip",
      color: "#FF0000",
      looping: true,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Updated Clip");
    expect(mocks.clip123.set).toHaveBeenCalledWith("color", 16711680);
    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", true);

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update a single arrangement clip by ID", async () => {
    setupMidiClipMock(mocks.clip789, {
      is_arrangement_clip: 1,
      start_time: 16.0,
    });

    const result = await updateClip({
      ids: "789",
      name: "Arrangement Clip",
      start: "1|3", // 2 beats = bar 1 beat 3 in 4/4
      length: "1:0", // 4 beats = 1 bar
    });

    expect(mocks.clip789.set).toHaveBeenCalledWith("name", "Arrangement Clip");
    expect(mocks.clip789.set).toHaveBeenCalledWith("loop_start", 2); // 1|3 in 4/4 = 2 Ableton beats
    expect(mocks.clip789.set).toHaveBeenCalledWith("loop_end", 6); // start (2) + length (4) = 6 Ableton beats
    expect(mocks.clip789.set).toHaveBeenCalledWith("end_marker", 6); // start (2) + length (4) = 6 Ableton beats

    expect(result).toStrictEqual({ id: "789" });
  });

  it("should switch to Arranger view when updating arrangement clips", async () => {
    setupMidiClipMock(mocks.clip999, {
      is_arrangement_clip: 1,
      start_time: 32.0,
    });

    const result = await updateClip({
      ids: "999",
      name: "Test Arrangement Clip",
    });

    // Verify result is returned (view switching is a side effect)
    expect(result).toStrictEqual({ id: "999" });
  });

  it("should update multiple clips by comma-separated IDs", async () => {
    setupMidiClipMock(mocks.clip123);
    setupAudioClipMock(mocks.clip456);

    const result = await updateClip({
      ids: "123, 456",
      color: "#00FF00",
      looping: false,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("color", 65280);
    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", false);
    expect(mocks.clip123.set).toHaveBeenCalledTimes(2);

    expect(mocks.clip456.set).toHaveBeenCalledWith("color", 65280);
    expect(mocks.clip456.set).toHaveBeenCalledWith("looping", false);
    expect(mocks.clip456.set).toHaveBeenCalledTimes(2);

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should update time signature when provided", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      timeSignature: "6/8",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should replace existing notes with real bar|beat parsing in 4/4 time", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      notes: "v80 t2 C4 1|1 v120 t1 D4 1|3",
      noteUpdateMode: "replace",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote({ pitch: 72, velocity: 80, duration: 2 }),
        createNote({ pitch: 74, velocity: 120, start_time: 2 }),
      ],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should parse notes using provided time signature with real bar|beat parsing", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      timeSignature: "6/8",
      notes: "C3 1|1 D3 2|1",
      noteUpdateMode: "replace",
    });

    // In 6/8 time, bar 2 beat 1 should be 3 Ableton beats (6 musical beats * 4/8 = 3 Ableton beats)
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote({ duration: 0.5 }),
        createNote({ pitch: 62, start_time: 3, duration: 0.5 }),
      ],
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should parse notes using clip's current time signature when timeSignature not provided", async () => {
    setupMidiClipMock(mocks.clip123, {
      signature_numerator: 3,
      signature_denominator: 4,
    }); // 3/4 time

    const result = await updateClip({
      ids: "123",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
      noteUpdateMode: "replace",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote(),
        createNote({ pitch: 62, start_time: 3 }), // Beat 3 in 3/4 time
      ],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should handle complex drum pattern with real bar|beat parsing", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      notes:
        "v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1 p0.6 Gb1 1|1.5 v90 p1.0 D1 v100 p0.9 Gb1 1|2",
      noteUpdateMode: "replace",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote({ pitch: 36, duration: 0.25 }),
        createNote({
          pitch: 42,
          duration: 0.25,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 20,
        }),
        createNote({
          pitch: 42,
          start_time: 0.5,
          duration: 0.25,
          velocity: 80,
          probability: 0.6,
          velocity_deviation: 20,
        }),
        createNote({
          pitch: 38,
          start_time: 1,
          duration: 0.25,
          velocity: 90,
        }),
        createNote({
          pitch: 42,
          start_time: 1,
          duration: 0.25,
          probability: 0.9,
        }),
      ],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 5 });
  });

  it("should throw error for invalid time signature format", async () => {
    setupMidiClipMock(mocks.clip123);

    await expect(
      updateClip({
        ids: "123",
        timeSignature: "invalid",
      }),
    ).rejects.toThrow("Time signature must be in format");
  });
});
