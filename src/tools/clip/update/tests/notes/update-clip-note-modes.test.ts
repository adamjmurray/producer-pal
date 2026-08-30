// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMergeNoteTracking,
  note,
  setupAudioClipMock,
  setupUpdateClipMocks,
  setupMidiClipMock,
  type UpdateClipMocks,
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
  clip: UpdateClipMocks["clip123"],
  expectedNotes = [DEFAULT_C3_NOTE],
): void {
  expectNotesCleared(clip);
  expect(clip.call).toHaveBeenCalledWith("add_new_notes", {
    notes: expectedNotes,
  });
}

/**
 * Assert that all notes were cleared but no new notes were added.
 * @param clip - The clip mock to check
 */
function expectNotesClearedOnly(clip: UpdateClipMocks["clip123"]): void {
  expectNotesCleared(clip);
  expect(clip.call).not.toHaveBeenCalledWith(
    "add_new_notes",
    expect.anything(),
  );
}

/**
 * Assert that remove_notes_extended was called with full range.
 * @param clip - The clip mock to check
 */
function expectNotesCleared(clip: UpdateClipMocks["clip123"]): void {
  expect(clip.call).toHaveBeenCalledWith(
    "remove_notes_extended",
    0,
    128,
    // Time window varies with the mock's clip length; the exact [-length,
    // 2*length] window is pinned by clip-notes.test.ts. Here just assert the
    // clear spanned the full pitch range.
    expect.any(Number),
    expect.any(Number),
  );
}

describe("updateClip - Note updates", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should filter out v0 notes when updating clips", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      notes: "v100 C3 v0 D3 v80 E3 1|1", // D3 should be filtered out
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
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
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 }); // C3 and E3, D3 filtered out
  });

  it("warns and skips notes on audio clips instead of throwing", async () => {
    setupAudioClipMock(mocks.clip123, { length: 8 });

    // Audio clips can't hold MIDI notes; writing them would throw and abort a
    // multi-clip batch. Warn-and-skip instead (mirrors create-clip's guard).
    await expect(
      updateClip({ id: "123", notes: "C3 1|1" }),
    ).resolves.toBeDefined();

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("notes parameter ignored for audio clip"),
    );
    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should handle clips with all v0 notes filtered out during update", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({
      id: "123",
      notes: "v0 C3 D3 E3 1|1", // All notes should be filtered out
    });

    expectNotesClearedOnly(mocks.clip123);
  });

  it("should overlay new notes onto a clip (default merge)", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock empty existing notes, then return added notes on subsequent calls
    let addedNotes: unknown[] = [];

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
        if (method === "add_new_notes") {
          const arg = args[0] as { notes?: unknown[] } | undefined;

          addedNotes = arg?.notes ?? [];
        } else if (method === "get_notes_extended") {
          return JSON.stringify({
            notes: addedNotes,
          });
        }

        return {};
      },
    );

    const result = await updateClip({
      id: "123",
      notes: "C3 1|1",
    });

    expectNoteReplaceAndAddCalls(mocks.clip123);

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 1 });
  });

  it("merges midi-json notes onto existing notes", async () => {
    setupMidiClipMock(mocks.clip123);

    // Seed with an existing C3; capture the merged write so the post-merge
    // note count reads back the combined set.
    let currentNotes: unknown[] = [DEFAULT_C3_NOTE];

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
        if (method === "add_new_notes") {
          const arg = args[0] as { notes?: unknown[] } | undefined;

          currentNotes = arg?.notes ?? [];
        } else if (method === "get_notes_extended") {
          return JSON.stringify({ notes: currentNotes });
        }

        return {};
      },
    );

    const result = await updateClip(
      {
        id: "123",
        notes: '[{"pitch":64,"start":1,"duration":1,"velocity":100}]',
      },
      { notation: "midi-json" },
    );

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        DEFAULT_C3_NOTE,
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ],
    });
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 });
  });

  it("deletes an existing note with a midi-json v:0 marker", async () => {
    setupMidiClipMock(mocks.clip123);
    mockMergeNoteTracking(mocks.clip123, [DEFAULT_C3_NOTE]);

    // v:0 deletes the existing C3; the E3 alongside it is still written, and no
    // velocity-0 note reaches add_new_notes (Live rejects it).
    const result = await updateClip(
      {
        id: "123",
        notes: "[{p:60,t:0,d:1,v:0},{p:64,t:1,d:1,v:100}]",
      },
      { notation: "midi-json" },
    );

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [note(64, 1)],
    });
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 1 });
  });

  it("clears the clip when every note is a midi-json v:0 marker", async () => {
    setupMidiClipMock(mocks.clip123);
    mockMergeNoteTracking(mocks.clip123, [DEFAULT_C3_NOTE]);

    await updateClip(
      { id: "123", notes: "[{p:60,t:0,d:1,v:0}]" },
      { notation: "midi-json" },
    );

    expectNotesClearedOnly(mocks.clip123);
  });

  it("should not call add_new_notes when the resulting notes array is empty", async () => {
    setupMidiClipMock(mocks.clip123);

    // Mock empty existing notes
    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [],
        });
      }

      return {};
    });

    await updateClip({
      id: "123",
      notes: "v0 C3 1|1", // All notes filtered out
    });

    expectNotesClearedOnly(mocks.clip123);
  });

  it("should apply transforms to existing notes without notes param", async () => {
    setupMidiClipMock(mocks.clip123);

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

    mocks.clip123.call.mockImplementation(
      (method: string, ...args: unknown[]) => {
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
      },
    );

    const result = await updateClip({
      id: "123",
      transforms: "velocity = 50",
      // No notes param: transforms-only path
    });

    // Notes should still exist with modified velocity
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 2,
      transformed: 2,
    });

    // Verify add_new_notes was called with modified notes
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
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
    });
  });
});
