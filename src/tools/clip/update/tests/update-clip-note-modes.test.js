import { beforeEach, describe, expect, it } from "vitest";
import { liveApiCall } from "#src/test/mocks/mock-live-api.js";
import {
  setupMocks,
  setupMidiClipMock,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";

const DEFAULT_C3_NOTE = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1.0,
  velocity_deviation: 0,
};

function expectNoteReplaceAndAddCalls(
  clipId,
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
});
