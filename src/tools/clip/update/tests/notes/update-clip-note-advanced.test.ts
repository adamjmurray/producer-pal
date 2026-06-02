// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMergeNoteTracking,
  note,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

function expectNoteUpdateCalls(
  clip: UpdateClipMocks["clip123"],
  expectedNotes: unknown[],
): void {
  expect(clip.call).toHaveBeenCalledWith(
    "get_notes_extended",
    0,
    128,
    0,
    1000000,
  );
  expect(clip.call).toHaveBeenCalledWith(
    "remove_notes_extended",
    0,
    128,
    0,
    1000000,
  );
  expect(clip.call).toHaveBeenCalledWith("add_new_notes", {
    notes: expectedNotes,
  });
}

describe("updateClip - Advanced note operations", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should set loop start when start is provided", async () => {
    setupMidiClipMock(mocks.clip123, { looping: 1 });

    await updateClip({
      ids: "123",
      start: "1|3",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 2);
  });

  it("should delete specific notes with v0", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock existing notes in the clip
    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            note(60, 0), // C3 at 1|1 - should be deleted
            note(62, 1, { velocity: 80 }), // D3 at 1|2 - should remain
            note(64, 0, { velocity: 90 }), // E3 at 1|1 - should remain
          ],
        });
      }

      return {};
    });

    const result = await updateClip({
      ids: "123",
      notes: "v0 C3 v100 F3 1|1", // Delete C3 at 1|1, add F3 at 1|1
    });

    // Should call get_notes_extended to read existing notes
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      0,
      1000000,
    );

    // Should remove all notes
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );

    // Should add back filtered existing notes plus new regular notes
    const addNewNotesCall = mocks.clip123.call.mock.calls.find(
      (call) => call[0] === "add_new_notes",
    ) as unknown[] | undefined;

    expect(addNewNotesCall).toBeDefined();
    const notesArg = addNewNotesCall![1] as { notes: unknown[] };

    expect(notesArg.notes).toHaveLength(3);
    expect(notesArg.notes).toContainEqual(note(62, 1, { velocity: 80 })); // D3 at 1|2
    expect(notesArg.notes).toContainEqual(note(64, 0, { velocity: 90 })); // E3 at 1|1
    expect(notesArg.notes).toContainEqual(note(65, 0)); // New F3 note

    expect(result).toStrictEqual({ id: "123", noteCount: 3 }); // 2 existing (D3, E3) + 1 new (F3), C3 deleted
  });

  it("should handle v0 notes when no existing notes match", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock existing notes that don't match the v0 note
    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [note(62, 1, { velocity: 80 })], // D3 at 1|2 - no match
        });
      }

      return {};
    });

    await updateClip({
      ids: "123",
      notes: "v0 C3 1|1", // Try to delete C3 at 1|1 (doesn't exist)
    });

    // Should still read existing notes and remove/add them back
    expectNoteUpdateCalls(mocks.clip123, [note(62, 1, { velocity: 80 })]); // Original note preserved
  });

  it("should call get_notes_extended to format existing notes", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock existing notes
    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }

      return {};
    });

    await updateClip({
      ids: "123",
      notes: "v100 C3 1|1",
    });

    // Should call get_notes_extended to merge with existing notes
    expectNoteUpdateCalls(mocks.clip123, [note(60, 0)]);
  });

  it("should support bar copy with existing notes", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock existing notes in bar 1, then return added notes after add_new_notes
    const existingNotes = [
      note(60, 0), // C3 at 1|1
      note(64, 1, { velocity: 80 }), // E3 at 1|2
    ];
    let addedNotes = existingNotes;

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
        if (method === "add_new_notes") {
          const arg = args[0] as { notes?: typeof existingNotes } | undefined;

          addedNotes = arg?.notes ?? [];
        } else if (method === "get_notes_extended") {
          return JSON.stringify({ notes: addedNotes });
        }

        return {};
      },
    );

    const result = await updateClip({
      ids: "123",
      notes: "@2=1", // Copy bar 1 to bar 2
    });

    // Should add existing notes + copied notes
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        // Existing notes in bar 1
        note(60, 0),
        note(64, 1, { velocity: 80 }),
        // Copied to bar 2 (starts at beat 4)
        note(60, 4),
        note(64, 5, { velocity: 80 }),
      ],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 4 }); // 2 existing + 2 copied
  });

  it("reports noteCount across read-clip's [-length, 2*length] window (near overhang counted, far overhang not)", async () => {
    setupMidiClipMock(mocks.clip123, { length: 8 }); // 2 bars

    // Mock to track added notes and return the subset inside the requested
    // window. get_notes_extended args are (pitchStart, pitchSpan, timeStart,
    // timeSpan), so the window is [timeStart, timeStart + timeSpan).
    let allAddedNotes: Array<{ start_time: number }> = [];

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
        if (method === "add_new_notes") {
          const arg = args[0] as { notes?: typeof allAddedNotes } | undefined;

          allAddedNotes = arg?.notes ?? [];
        } else if (method === "get_notes_extended") {
          const startBeat = (args[2] as number | undefined) ?? 0;
          const span = (args[3] as number | undefined) ?? Infinity;
          const notesInRange = allAddedNotes.filter(
            (n) => n.start_time >= startBeat && n.start_time < startBeat + span,
          );

          return JSON.stringify({ notes: notesInRange });
        }

        return {};
      },
    );

    const result = await updateClip({
      ids: "123",
      notes: "C3 1|1 D3 2|1 E3 3|1 F3 6|1", // beats 0, 4, 8, 20
      length: "2bar", // Clip length = 2 bars (8 beats)
    });

    // All 4 notes are written (Live stores notes past the clip length).
    expect(allAddedNotes).toHaveLength(4);

    // noteCount mirrors read-clip's window [-8, 16): beats 0, 4, and the overhang
    // at 8 are counted; F3 at beat 20 (> one clip-length past the end) is not.
    expect(result).toStrictEqual({ id: "123", noteCount: 3 });

    // Window: from -length (-8) spanning length*3 (24), i.e. [-8, 16).
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      -8,
      24,
    );
  });

  it("should support bar copy with v0 deletions", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock existing notes in bar 1
    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            note(60, 0), // C3 at 1|1
            note(64, 1, { velocity: 80 }), // E3 at 1|2
          ],
        });
      }

      return {};
    });

    const result = await updateClip({
      ids: "123",
      notes: "v0 C3 1|1 @2=1", // Delete C3 at 1|1, then copy bar 1 (now only E3) to bar 2
    });

    // Should have E3 in bar 1 and E3 copied to bar 2 (C3 deleted by v0)
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        // E3 remains in bar 1 (C3 deleted)
        note(64, 1, { velocity: 80 }),
        // E3 copied to bar 2 (beat 5)
        note(64, 5, { velocity: 80 }),
      ],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 2 }); // E3 in bar 1 + E3 in bar 2, C3 deleted
  });

  it("should update warp mode for audio clips", async () => {
    setupAudioClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      warpMode: "complex",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "warp_mode",
      4, // Complex mode = 4
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update warping on/off for audio clips", async () => {
    setupAudioClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      warping: true,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "warping",
      1, // true = 1
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update both warp mode and warping together", async () => {
    setupAudioClipMock(mocks.clip123);

    const result = await updateClip({
      ids: "123",
      warpMode: "beats",
      warping: false,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "warp_mode",
      0, // Beats mode = 0
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith(
      "warping",
      0, // false = 0
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  // AJM-485: the merge path concatenates existing + new notes, so the combined
  // array is unsorted (existing sorted, new appended in authored order). Before
  // add_new_notes we dedupe same-pitch+start collisions (new wins) then sort
  // ascending, so Live can't silently drop notes via onset-overlap deletion.
  describe("merge: dedupe + sort before add_new_notes", () => {
    it("sorts merged notes ascending so a new onset-overlapping same-pitch note can't delete the existing one", async () => {
      setupMidiClipMock(mocks.clip123);

      // Existing C1 at 1|3 (beat 2), a quarter note spanning [2,3].
      const tracking = mockMergeNoteTracking(mocks.clip123, [
        note(36, 2, { duration: 1 }),
      ]);

      const result = await updateClip({
        ids: "123",
        // New C1 half note at 1|2 (beat 1) spanning [1,3] — its onset precedes
        // the existing note's. Unsorted (existing@2 then new@1), Live would
        // delete the existing note; sorted ascending it becomes a tail overlap.
        notes: "n/2 C1 1|2",
      });

      const added = tracking.getAddedNotes() as { start_time: number }[];

      expect(added.map((n) => n.start_time)).toStrictEqual([1, 2]);
      expect(result).toStrictEqual({ id: "123", noteCount: 2 });
    });

    it("dedupes a same-pitch+start restatement, keeping the new (shorter) note", async () => {
      setupMidiClipMock(mocks.clip123);

      // Existing C1 at 1|1 spanning two beats [0,2].
      const tracking = mockMergeNoteTracking(mocks.clip123, [
        note(36, 0, { duration: 2 }),
      ]);

      const result = await updateClip({
        ids: "123",
        // Restate C1 at 1|1 as a quarter note — overwrites, not doubles up.
        notes: "n/4 C1 1|1",
      });

      const added = tracking.getAddedNotes() as {
        start_time: number;
        duration: number;
      }[];

      expect(added).toHaveLength(1);
      expect(added[0]?.start_time).toBe(0);
      expect(added[0]?.duration).toBe(1);
      expect(result).toStrictEqual({ id: "123", noteCount: 1 });
    });
  });
});
