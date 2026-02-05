// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { liveApiCall } from "#src/test/mocks/mock-live-api.ts";
import {
  setupMocks,
  setupMidiClipMock,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const DEFAULT_C3_NOTE = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1.0,
  velocity_deviation: 0,
};

function expectNoteReplaceAndAddCalls(
  clipId: string,
  expectedNotes = [DEFAULT_C3_NOTE],
) {
  expect(liveApiCall).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "remove_notes_extended",
    0,
    128,
    0,
    1000000,
  );
  expect(liveApiCall).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "add_new_notes",
    { notes: expectedNotes },
  );
}

describe("updateClip - Note update modes", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("should filter out v0 notes when updating clips", () => {
    setupMidiClipMock("123");

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

    expect(result).toStrictEqual({ id: "123", noteCount: 2 }); // C3 and E3, D3 filtered out
  });

  it("should handle clips with all v0 notes filtered out during update", () => {
    setupMidiClipMock("123");

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
    setupMidiClipMock("123");

    const result = updateClip({
      ids: "123",
      notes: "C3 1|1",
      noteUpdateMode: "replace",
    });

    expectNoteReplaceAndAddCalls("123");

    expect(result).toStrictEqual({ id: "123", noteCount: 1 });
  });

  it("should add to existing notes when noteUpdateMode is 'merge'", () => {
    setupMidiClipMock("123");

    // Mock empty existing notes, then return added notes on subsequent calls
    let addedNotes: unknown[] = [];

    liveApiCall.mockImplementation(function (
      method: string,
      ...args: unknown[]
    ) {
      if (method === "add_new_notes") {
        const arg = args[0] as { notes?: unknown[] } | undefined;

        addedNotes = arg?.notes ?? [];
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

    expectNoteReplaceAndAddCalls("123");

    expect(result).toStrictEqual({ id: "123", noteCount: 1 });
  });

  it("should not call add_new_notes when noteUpdateMode is 'merge' and notes array is empty", () => {
    setupMidiClipMock("123");

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

  it("should apply transforms to existing notes without notes param", () => {
    setupMidiClipMock("123");

    // Seed the mock with pre-existing notes in Live API format (with extra properties)
    // The Live API returns note_id, mute, release_velocity which must be stripped
    const existingNotes = [
      {
        note_id: 100,
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 101,
        pitch: 64,
        start_time: 1,
        duration: 1,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
    ];

    let currentNotes: unknown[] = [...existingNotes];

    liveApiCall.mockImplementation(function (
      method: string,
      ...args: unknown[]
    ) {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: currentNotes });
      }

      if (method === "remove_notes_extended") {
        currentNotes = [];
      }

      if (method === "add_new_notes") {
        currentNotes = (args[0] as { notes: typeof existingNotes }).notes;
      }

      return {};
    });

    const result = updateClip({
      ids: "123",
      transforms: "velocity = 50",
      // No notes param, no noteUpdateMode
    });

    // Notes should still exist with modified velocity
    expect(result).toStrictEqual({ id: "123", noteCount: 2 });

    // Verify add_new_notes was called with modified notes
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 50,
            probability: 1,
            velocity_deviation: 0,
          },
          {
            pitch: 64,
            start_time: 1,
            duration: 1,
            velocity: 50,
            probability: 1,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });
});
