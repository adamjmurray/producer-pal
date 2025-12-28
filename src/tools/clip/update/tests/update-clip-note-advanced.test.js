import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { setupMocks } from "../helpers/update-clip-test-helpers.js";
import { updateClip } from "../update-clip.js";

describe("updateClip - Advanced note operations", () => {
  beforeEach(() => {
    setupMocks();
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

    expect(result).toStrictEqual({ id: "123", noteCount: 3 }); // 2 existing (D3, E3) + 1 new (F3), C3 deleted
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

    expect(result).toStrictEqual({ id: "123", noteCount: 4 }); // 2 existing + 2 copied
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
    expect(allAddedNotes).toHaveLength(3);

    // But noteCount should only include notes within the 2-bar playback region
    // C3 at bar 1 (beat 0) and D3 at bar 2 (beat 4) are within 8 beats
    // E3 at bar 3 (beat 8) is outside the playback region
    expect(result).toStrictEqual({ id: "123", noteCount: 2 });

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

    expect(result).toStrictEqual({ id: "123", noteCount: 2 }); // E3 in bar 1 + E3 in bar 2, C3 deleted
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

    expect(result).toStrictEqual({ id: "123" });
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

    expect(result).toStrictEqual({ id: "123" });
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

    expect(result).toStrictEqual({ id: "123" });
  });
});
