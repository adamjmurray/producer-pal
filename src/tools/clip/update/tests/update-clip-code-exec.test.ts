// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setupMocks,
  setupMidiClipMock,
  type UpdateClipMockHandles,
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

describe("updateClip - code execution", () => {
  let handles: UpdateClipMockHandles;

  beforeEach(() => {
    handles = setupMocks();
  });

  it("should execute code on a single session clip and apply resulting notes", async () => {
    setupMidiClipMock(handles.clip123, { length: 4 });

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: true,
      notes: [
        {
          pitch: 60,
          start: 0,
          duration: 1,
          velocity: 100,
          velocityDeviation: 0,
          probability: 1,
        },
        {
          pitch: 64,
          start: 1,
          duration: 1,
          velocity: 80,
          velocityDeviation: 0,
          probability: 1,
        },
      ],
    });

    const result = await updateClip({
      ids: "123",
      code: "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }))",
    });

    expect(executeNoteCode).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "123" }),
      "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }))",
      "session",
      0,
      undefined,
    );

    // applyNotesToClip should have been called (removes + adds notes)
    expect(handles.clip123.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(handles.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 80,
          velocity_deviation: 0,
          probability: 1,
        },
      ],
    });

    expect(result).toStrictEqual({ id: "123", noteCount: 2 });
  });

  it("should execute code on multiple clips", async () => {
    setupMidiClipMock(handles.clip123, { length: 4 });
    setupMidiClipMock(handles.clip456, { length: 4 });

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: true,
      notes: [
        {
          pitch: 72,
          start: 0,
          duration: 1,
          velocity: 100,
          velocityDeviation: 0,
          probability: 1,
        },
      ],
    });

    const result = await updateClip({
      ids: "123, 456",
      code: "return [{ pitch: 72, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }]",
    });

    expect(executeNoteCode).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual([
      { id: "123", noteCount: 1 },
      { id: "456", noteCount: 1 },
    ]);
  });

  it("should warn and continue when code execution fails for a clip", async () => {
    setupMidiClipMock(handles.clip123, { length: 4 });

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: false,
      error: "SyntaxError: Unexpected token",
    });

    const result = await updateClip({
      ids: "123",
      code: "invalid code {{",
    });

    // Should NOT call add_new_notes since execution failed
    expect(handles.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );

    // Should emit a warning via console.warn (routed through outlet)
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Code execution failed for clip 123"),
    );

    // Should still return a result with current note count
    expect(result).toStrictEqual({ id: "123", noteCount: 0 });
  });

  it("should handle mixed success/failure across multiple clips", async () => {
    setupMidiClipMock(handles.clip123, { length: 4 });
    setupMidiClipMock(handles.clip456, { length: 4 });

    vi.mocked(executeNoteCode)
      .mockResolvedValueOnce({
        success: true,
        notes: [
          {
            pitch: 60,
            start: 0,
            duration: 1,
            velocity: 100,
            velocityDeviation: 0,
            probability: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        success: false,
        error: "Runtime error",
      });

    const result = await updateClip({
      ids: "123, 456",
      code: "return notes",
    });

    // First clip succeeds, second clip fails
    expect(result).toStrictEqual([
      { id: "123", noteCount: 1 },
      { id: "456", noteCount: 0 },
    ]);

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Code execution failed for clip 456"),
    );
  });

  it("should pass arrangement clip location info to executeNoteCode", async () => {
    setupMidiClipMock(handles.clip789, {
      is_arrangement_clip: 1,
      start_time: 16.0,
      length: 4,
    });

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: true,
      notes: [],
    });

    await updateClip({
      ids: "789",
      code: "return []",
    });

    expect(executeNoteCode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "789" }),
      "return []",
      "arrangement",
      undefined,
      16.0,
    );
  });
});
