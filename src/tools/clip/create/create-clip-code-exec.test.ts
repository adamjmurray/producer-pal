// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { createClip } from "./create-clip.ts";

// Mock the code execution protocol module
vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

// Import the mocked module to configure per-test behavior
import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";

/**
 * Track added notes per clip for mock get_notes_extended.
 * Key is the clip context (stringified _id or _path).
 */
function setupNoteTrackingMock(): void {
  const addedNotes = new Map<string, unknown[]>();

  liveApiCall.mockImplementation(function (
    this: { _id?: string; _path?: string; id?: string },
    method: string,
    ...args: unknown[]
  ) {
    const key = this._id ?? this._path ?? this.id ?? "";

    if (method === "add_new_notes") {
      const firstArg = args[0] as { notes?: unknown[] } | undefined;
      const existing = addedNotes.get(key) ?? [];

      addedNotes.set(key, [...existing, ...(firstArg?.notes ?? [])]);
    } else if (method === "get_notes_extended") {
      const notes = addedNotes.get(key) ?? [];

      return JSON.stringify({ notes });
    }

    return null;
  });
}

describe("createClip - code execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should apply code to a created session clip", async () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      Clip: { length: 4 },
    });
    setupNoteTrackingMock();

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
          velocity: 90,
          velocityDeviation: 0,
          probability: 1,
        },
      ],
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      code: "return [{ pitch: 60, start: 0, duration: 1, velocity: 100 }]",
    });

    expect(executeNoteCode).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        _id: "live_set/tracks/0/clip_slots/0/clip",
      }),
      "return [{ pitch: 60, start: 0, duration: 1, velocity: 100 }]",
      "session",
      undefined,
      undefined,
    );

    // applyNotesToClip should have been called (remove + add)
    expect(liveApiCall).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      0,
      1000000,
    );
    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
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
          velocity: 90,
          velocity_deviation: 0,
          probability: 1,
        },
      ],
    });

    // noteCount should be updated from getClipNoteCount
    const resultObj = result as { noteCount?: number };

    expect(resultObj.noteCount).toBe(2);
  });

  it("should warn when code execution fails for a created clip", async () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      Clip: { length: 4 },
    });

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: false,
      error: "TypeError: notes.map is not a function",
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      code: "return notes.map(invalid)",
    });

    // Should emit a warning via console.warn
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Code execution failed for clip"),
    );

    // Should still return the clip result (without updated noteCount)
    const resultObj = result as { id?: string };

    expect(resultObj.id).toBeDefined();
  });

  it("should apply code to multiple created clips", async () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      Clip: { length: 4 },
    });
    setupNoteTrackingMock();

    vi.mocked(executeNoteCode).mockResolvedValue({
      success: true,
      notes: [
        {
          pitch: 48,
          start: 0,
          duration: 2,
          velocity: 110,
          velocityDeviation: 0,
          probability: 1,
        },
      ],
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0, 1",
      code: "return [{ pitch: 48, start: 0, duration: 2, velocity: 110 }]",
    });

    expect(executeNoteCode).toHaveBeenCalledTimes(2);

    const results = result as Array<{ noteCount?: number }>;

    expect(results).toHaveLength(2);
    expect(results[0]?.noteCount).toBe(1);
    expect(results[1]?.noteCount).toBe(1);
  });

  it("should not call executeNoteCode when code is not provided", async () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 1|1",
    });

    expect(executeNoteCode).not.toHaveBeenCalled();
  });
});
