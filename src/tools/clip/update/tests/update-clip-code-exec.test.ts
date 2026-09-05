// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  codeNote,
  toLiveApiNote,
  codeExecSuccess,
  codeExecFailure,
} from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";
import {
  setupUpdateClipMocks,
  setupMidiClipMock,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// Mock the code execution protocol module
vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

// Import the mocked module to configure per-test behavior
import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateClip - code execution", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should execute code on a single session clip and apply resulting notes", async () => {
    setupMidiClipMock(mocks.clip123, { length: 4 });

    const notes = [codeNote(60, 0), codeNote(64, 1, { velocity: 80 })];

    vi.mocked(executeNoteCode).mockResolvedValue(codeExecSuccess(notes));

    const result = await updateClip({
      id: "123",
      code: "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }))",
    });

    expect(executeNoteCode).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "123" }),
      "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }))",
      "session",
      0,
      1,
      0,
    );

    // applyNotesToClip should have been called (removes + adds notes)
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      // Window varies with clip length; clip-notes.test.ts pins it exactly.
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: notes.map(toLiveApiNote),
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 });
  });

  it("should execute code on multiple clips, threading clip.index/clip.count", async () => {
    setupMidiClipMock(mocks.clip123, { length: 4 });
    setupMidiClipMock(mocks.clip456, { length: 4 });

    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(72, 0)]),
    );

    const result = await updateClip({
      id: "123, 456",
      code: "return [{ pitch: 72, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }]",
    });

    expect(executeNoteCode).toHaveBeenCalledTimes(2);
    // clip.index/clip.count span the full batch (0/2 and 1/2) so user code can
    // vary per copy via context.clip.index — the new equivalent of the old
    // per-clip code array.
    expect(executeNoteCode).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "123" }),
      expect.any(String),
      "session",
      0,
      2,
      0,
    );
    expect(executeNoteCode).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "456" }),
      expect.any(String),
      "session",
      1,
      2,
      1,
    );
    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0", noteCount: 1 },
      { id: "456", path: "t1/s1", noteCount: 1 },
    ]);
  });

  it("should warn and continue when code execution fails for a clip", async () => {
    setupMidiClipMock(mocks.clip123, { length: 4 });

    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecFailure("SyntaxError: Unexpected token"),
    );

    const result = await updateClip({
      id: "123",
      code: "invalid code {{",
    });

    // Should NOT call add_new_notes since execution failed
    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );

    // Should emit a warning via console.warn (routed through outlet)
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "Code execution failed for clip t0/s0 (id 123): SyntaxError: Unexpected token",
      ),
    );

    // Should still return a result with current note count
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 0 });
  });

  it("should handle mixed success/failure across multiple clips", async () => {
    setupMidiClipMock(mocks.clip123, { length: 4 });
    setupMidiClipMock(mocks.clip456, { length: 4 });

    vi.mocked(executeNoteCode)
      .mockResolvedValueOnce(codeExecSuccess([codeNote(60, 0)]))
      .mockResolvedValueOnce(codeExecFailure("Runtime error"));

    const result = await updateClip({
      id: "123, 456",
      code: "return notes",
    });

    // First clip succeeds, second clip fails
    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0", noteCount: 1 },
      { id: "456", path: "t1/s1", noteCount: 0 },
    ]);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "Code execution failed for clip t1/s1 (id 456): Runtime error",
      ),
    );
  });

  it("should tell executeNoteCode an arrangement clip is in no scene", async () => {
    setupMidiClipMock(mocks.clip789, {
      is_arrangement_clip: 1,
      start_time: 16.0,
      length: 4,
    });

    vi.mocked(executeNoteCode).mockResolvedValue(codeExecSuccess([]));

    await updateClip({
      id: "789",
      code: "return []",
    });

    expect(executeNoteCode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "789" }),
      "return []",
      "arrangement",
      0,
      1,
      undefined,
    );
  });
});
