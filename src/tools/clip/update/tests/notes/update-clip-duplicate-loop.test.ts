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
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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
  clip.call.mockImplementation((method: string) =>
    method === "get_notes_extended" ? notesJson(noteCount) : {},
  );
}

/**
 * What get_notes_extended returns for a clip holding `noteCount` identical
 * notes.
 * @param noteCount - Number of notes to report
 * @returns The JSON string Live's API hands back
 */
function notesJson(noteCount: number): string {
  return JSON.stringify({
    notes: Array.from({ length: noteCount }, () => ({
      pitch: 60,
      start_time: 0,
      duration: 1,
      velocity: 100,
    })),
  });
}

/**
 * Report a different note count before and after duplicate_loop runs. The whole
 * point of the preTransform count is that it is the pre-doubling number, and a
 * fixture that answers the same on both sides cannot tell a correct report from
 * one that reused the post-doubling count.
 * @param clip - Registered mock clip
 * @param before - Notes the clip holds before duplicate_loop
 * @param after - Notes it holds afterwards
 */
function mockNoteCountAroundDuplication(
  clip: UpdateClipMocks[keyof UpdateClipMocks],
  before: number,
  after: number,
): void {
  let duplicated = false;

  clip.call.mockImplementation((method: string) => {
    if (method === "duplicate_loop") {
      duplicated = true;

      return {};
    }

    return method === "get_notes_extended"
      ? notesJson(duplicated ? after : before)
      : {};
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

    const result = await updateClip({ id: "123", duplicateLoop: true });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 8,
      length: "2bar",
    });
  });

  it("doubles an arrangement MIDI clip", async () => {
    setupArrangementMidiClipMock(mocks.clip789);
    mockNoteCount(mocks.clip789, 4);

    const result = await updateClip({ id: "789", duplicateLoop: true });

    expect(mocks.clip789.call).toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual({
      id: "789",
      path: "t2[1|1]",
      noteCount: 4,
      length: "2bar",
    });
  });

  it("warns and skips audio clips without calling duplicate_loop", async () => {
    setupAudioClipMock(mocks.clip123);

    const result = await updateClip({ id: "123", duplicateLoop: true });

    expect(mocks.clip123.call).not.toHaveBeenCalledWith("duplicate_loop");
    expect(capturedWarnings()).toContain(
      "duplicateLoop parameter ignored for audio clip t0/s0 (id 123)",
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("processes MIDI clips while skipping audio in a mixed batch", async () => {
    setupMidiClipMock(mocks.clip123);
    setupAudioClipMock(mocks.clip456);
    mockNoteCount(mocks.clip123, 6);

    const result = await updateClip({ id: "123, 456", duplicateLoop: true });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(mocks.clip456.call).not.toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0", noteCount: 6, length: "2bar" },
      { id: "456", path: "t1/s1" },
    ]);
  });

  // start/length set the loop region, which is exactly what duplicate_loop
  // copies, so the pair reads two ways - "the region to double" or "the length
  // to end up at" - and both look like success. Refused instead (ADR-0040).
  it.each([
    ["length", { length: "4bar" }, "combined with length: length sets"],
    ["start", { start: "2|1" }, "combined with start: start sets"],
    [
      "both",
      { start: "2|1", length: "4bar" },
      "start or length: start/length set",
    ],
  ])("refuses %s alongside duplicateLoop", async (_case, region, message) => {
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 0,
      loop_end: 2,
    });
    mockNoteCount(mocks.clip123, 8);

    await expect(
      updateClip({ id: "123", duplicateLoop: true, ...region }),
    ).rejects.toThrow(message);

    // Refused on the args alone, so nothing ran: no region write, no double.
    expect(mocks.clip123.set).not.toHaveBeenCalled();
    expect(mocks.clip123.call).not.toHaveBeenCalledWith("duplicate_loop");
  });

  it("offers the whole-clip double before the sub-region one", async () => {
    // Measured: a model handed "send two calls" first does exactly that, sets
    // the region it never wanted, and overshoots again. The common case leads.
    setupMidiClipMock(mocks.clip123);

    await expect(
      updateClip({ id: "123", duplicateLoop: true, length: "4bar" }),
    ).rejects.toThrow(
      /To double the whole clip, send duplicateLoop on its own\. To double just part of it, send length in a separate call first\./,
    );
  });

  it("refuses the whole batch before touching any clip", async () => {
    // Whole-call params, so a per-clip skip would repeat the message down the
    // list. The audio clip would not even have doubled, and it still must not
    // get the region write.
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 0,
      loop_end: 2,
    });
    setupAudioClipMock(mocks.clip456, {
      looping: 1,
      loop_start: 0,
      loop_end: 2,
    });

    await expect(
      updateClip({
        id: "123, 456",
        duplicateLoop: true,
        start: "1|1",
        length: "4bar",
      }),
    ).rejects.toThrow("duplicateLoop cannot be combined with start or length");

    expect(mocks.clip123.set).not.toHaveBeenCalled();
    expect(mocks.clip456.set).not.toHaveBeenCalled();
  });

  it("still composes firstStart, which does not move the region", async () => {
    // firstStart is the playback marker, not the loop region, so it does not
    // select what gets copied - probed against Live in all three orders.
    setupMidiClipMock(mocks.clip123, {
      looping: 1,
      loop_start: 0,
      loop_end: 8,
      end_marker: 8,
    });
    mockNoteCount(mocks.clip123, 8);

    const result = await updateClip({
      id: "123",
      duplicateLoop: true,
      firstStart: "2|1",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("start_marker", 4);
    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 8,
      length: "2bar",
    });
  });

  it.each([
    // Either transform string reports how many notes it matched; `notes` alone
    // transforms nothing, so it reports no count.
    [
      "notes",
      "C3 1|1",
      { id: "123", path: "t0/s0", noteCount: 8, length: "2bar" },
    ],
    [
      "transforms",
      "pitch += 12",
      {
        transformed: 8,
        id: "123",
        path: "t0/s0",
        noteCount: 8,
        length: "2bar",
      },
    ],
    [
      "preTransforms",
      "pitch += 12",
      {
        transformed: 8,
        id: "123",
        path: "t0/s0",
        noteCount: 8,
        length: "2bar",
      },
    ],
  ])(
    "doubles and composes %s without warning",
    async (param, value, expected) => {
      setupMidiClipMock(mocks.clip123);
      mockNoteCount(mocks.clip123, 8);

      const result = await updateClip({
        id: "123",
        duplicateLoop: true,
        [param]: value,
      });

      expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
      // These compose cleanly, so the call is silent - the params that don't
      // are refused up front now, not warned about.
      expect(capturedWarnings()).toStrictEqual([]);
      expect(result).toStrictEqual(expected);
    },
  );

  it("reports the preTransform count when notes follow but no transforms do", async () => {
    // The merge stage is handed no preTransform string of its own, so this is
    // the pairing where the count used to fall through and go unreported.
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    const result = await updateClip({
      id: "123",
      duplicateLoop: true,
      preTransforms: "pitch += 12",
      notes: "1|1 C3",
    });

    expect(result).toStrictEqual({
      transformed: 8,
      id: "123",
      path: "t0/s0",
      noteCount: 8,
      length: "2bar",
    });
  });

  // The count reported has to be Stage 1's own match count, not the doubled
  // note count the clip ends up with.
  it("reports the pre-doubling count, not the post-doubling one", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCountAroundDuplication(mocks.clip123, 4, 8);

    const result = await updateClip({
      id: "123",
      duplicateLoop: true,
      preTransforms: "pitch += 12",
      notes: "1|1 C3",
    });

    expect(result).toStrictEqual({
      transformed: 4,
      id: "123",
      path: "t0/s0",
      noteCount: 8,
      length: "2bar",
    });
  });

  it("prefers the transforms count over the preTransforms one", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    const result = await updateClip({
      id: "123",
      duplicateLoop: true,
      preTransforms: "C3: pitch += 12",
      transforms: "pitch += 1",
    });

    // Both ran; the reported count is the later pass's, matching every other
    // path where transforms wins over preTransforms.
    expect(result).toStrictEqual({
      transformed: 8,
      id: "123",
      path: "t0/s0",
      noteCount: 8,
      length: "2bar",
    });
  });

  it("composes code: doubles the loop, then runs code on the doubled clip", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);
    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(60, 0)]),
    );

    const result = await updateClip({
      id: "123",
      duplicateLoop: true,
      code: "return notes;",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("duplicate_loop");
    expect(executeNoteCode).toHaveBeenCalledOnce();
    expect(capturedWarnings()).toStrictEqual([]);
    expect(result).toStrictEqual({
      path: "t0/s0",
      noteCount: 8,
      id: "123",
      length: "2bar",
    });
  });

  it("applies preTransforms before the double and notes/transforms after", async () => {
    setupMidiClipMock(mocks.clip123);
    mockNoteCount(mocks.clip123, 8);

    await updateClip({
      id: "123",
      duplicateLoop: true,
      preTransforms: "pitch += 12",
      notes: "1|1 C3",
      transforms: "pitch -= 12",
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
