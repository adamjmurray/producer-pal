// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupArrangementMidiClipMock,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/**
 * Make a clip's call mock report `noteCount` notes from get_notes_extended, so
 * the post-duplicate_loop note-count read returns the (doubled) count. Other
 * calls (incl. duplicate_loop itself) return an empty object.
 * @param clip - Registered mock clip
 * @param noteCount - Number of notes get_notes_extended should report
 */
function mockNoteCount(
  clip: UpdateClipMocks[keyof UpdateClipMocks],
  noteCount: number,
): void {
  clip.call.mockImplementation((method: string) => {
    if (method === "get_notes_extended") {
      return JSON.stringify({
        notes: Array.from({ length: noteCount }, () => ({
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
        })),
      });
    }

    return {};
  });
}

describe("updateClip - duplicateLoop", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("doubles a MIDI session clip via native duplicate_loop and reports the new note count", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    const result = await updateClip({ ids: "123", duplicateLoop: true });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual({ id: "123", noteCount: 8 });
  });

  it("doubles an arrangement MIDI clip", async () => {
    setupArrangementMidiClipMock(mocks.clip789);
    mockNoteCount(mocks.clip789, 4);

    const result = await updateClip({ ids: "789", duplicateLoop: true });

    expect(mocks.clip789.call).toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual({ id: "789", noteCount: 4 });
  });

  it("warns and skips audio clips without calling duplicate_loop", async () => {
    setupAudioClipMock(mocks.clip123);

    const result = await updateClip({ ids: "123", duplicateLoop: true });

    expect(mocks.clip123.call).not.toHaveBeenCalledWith("duplicate_loop");
    expect(outlet).toHaveBeenCalledWith(
      1,
      "duplicateLoop parameter ignored for audio clip (id 123)",
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("processes MIDI clips while skipping audio in a mixed batch", async () => {
    setupMidiClipMock(mocks.clip123);
    setupAudioClipMock(mocks.clip456);
    mockNoteCount(mocks.clip123, 6);

    const result = await updateClip({ ids: "123, 456", duplicateLoop: true });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(mocks.clip456.call).not.toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual([{ id: "123", noteCount: 6 }, { id: "456" }]);
  });

  it.each([
    ["length", "4bar"],
    ["notes", "1|1 C3"],
    ["transforms", "v0"],
    ["preTransforms", "v0"],
    ["code", "return notes;"],
  ])(
    "still doubles, warns, and ignores %s when combined (standalone op wins)",
    async (param, value) => {
      setupMidiClipMock(mocks.clip123);
      mockNoteCount(mocks.clip123, 8);

      const result = await updateClip({
        ids: "123",
        duplicateLoop: true,
        [param]: value,
      });

      expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("duplicateLoop is a standalone operation"),
      );
      expect(result).toStrictEqual({ id: "123", noteCount: 8 });
    },
  );

  it("names every skipped edit in the warning when several are combined", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    await updateClip({
      ids: "123",
      duplicateLoop: true,
      length: "4bar",
      notes: "1|1 C3",
      transforms: "v0",
      preTransforms: "v0",
      code: "return notes;",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "duplicateLoop is a standalone operation - ignoring length, notes, transforms, preTransforms, code. Run the loop-double and these edits as separate update-clip calls.",
    );
  });
});
