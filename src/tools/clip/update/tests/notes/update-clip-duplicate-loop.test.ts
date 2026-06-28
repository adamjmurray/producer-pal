// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  codeExecSuccess,
  codeNote,
} from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";
import {
  setupArrangementMidiClipMock,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";

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

  it("still doubles and warns when length is combined (the double sets length)", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    const result = await updateClip({
      ids: "123",
      duplicateLoop: true,
      length: "4bar",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("duplicateLoop sets the clip length itself"),
    );
    expect(result).toStrictEqual({ id: "123", noteCount: 8 });
  });

  it.each([
    ["notes", "1|1 C3"],
    ["transforms", "p+12"],
    ["preTransforms", "p+12"],
  ])(
    "doubles and composes %s without warning (no length conflict)",
    async (param, value) => {
      setupMidiClipMock(mocks.clip123);
      mockNoteCount(mocks.clip123, 8);

      const result = await updateClip({
        ids: "123",
        duplicateLoop: true,
        [param]: value,
      });

      expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("duplicateLoop sets the clip length"),
      );
      expect(result).toMatchObject({ id: "123", noteCount: 8 });
    },
  );

  it("composes code: doubles the loop, then runs code on the doubled clip", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);
    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(60, 0)]),
    );

    const result = await updateClip({
      ids: "123",
      duplicateLoop: true,
      code: "return notes;",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(executeNoteCode).toHaveBeenCalledOnce();
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("duplicateLoop sets the clip length"),
    );
    expect(result).toMatchObject({ id: "123" });
  });

  it("applies preTransforms before the double and notes/transforms after", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    await updateClip({
      ids: "123",
      duplicateLoop: true,
      preTransforms: "p+12",
      notes: "1|1 C3",
      transforms: "p-12",
    });

    // preTransforms flushes a write, then the native double, then the post-merge
    // write all hit the same clip in order.
    const order = mocks.clip123.call.mock.calls.map((c) => c[0]);
    const firstAdd = order.indexOf("add_new_notes");
    const dup = order.indexOf("duplicate_loop");

    expect(firstAdd).toBeGreaterThanOrEqual(0);
    expect(dup).toBeGreaterThan(firstAdd);
    expect(order.lastIndexOf("add_new_notes")).toBeGreaterThan(dup);
  });
});
