// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Code never sees a clip's muted notes, so what its write does to them is said
// on the clip's entry, the way a notes write says it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  codeExecSuccess,
  codeNote,
} from "#src/tools/clip/code-exec/tests/code-exec-test-helpers.ts";
import {
  mockMergeNoteTracking,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { newClipReasons } from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { applyCodeToWrittenClips } from "#src/tools/clip/update/helpers/call/apply-clip-code.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
  executeNoteCodeWithData: vi.fn(),
  requestCodeExecution: vi.fn(),
  handleCodeExecResult: vi.fn(),
}));

import { executeNoteCode } from "#src/live-api-adapter/code-exec-v8-protocol.ts";

/**
 * A note as Live reads it back.
 * @param id - The note's id
 * @param pitch - MIDI pitch
 * @param start - Start, in beats
 * @param duration - Length, in beats
 * @param mute - 1 for a muted note
 * @returns The note
 */
function liveNote(
  id: number,
  pitch: number,
  start: number,
  duration: number,
  mute: number,
): Record<string, unknown> {
  return {
    note_id: id,
    pitch,
    start_time: start,
    duration,
    velocity: 100,
    mute,
    probability: 1,
    velocity_deviation: 0,
    release_velocity: 64,
  };
}

describe("updateClip - code write beside muted notes", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 4 });
  });

  it("says when a code note replaced a muted note", async () => {
    mockMergeNoteTracking(mocks.clip123, [
      liveNote(1, 60, 0, 1, 0),
      liveNote(2, 64, 1, 1, 1),
    ]);
    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(60, 0), codeNote(64, 1)]),
    );

    const result = await updateClip({ id: "123", code: "return notes" });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 2,
      detail: "replaced 1 muted note at the same pitch and start",
    });
  });

  it("says when a code note shortened a muted note", async () => {
    const muted = liveNote(2, 64, 0, 2, 1);
    let landed: Record<string, unknown>[] = [muted];

    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: landed });
      }

      if (method === "add_new_notes") {
        // Live cuts the earlier of two same-pitch notes at the later one's start.
        landed = [{ ...muted, duration: 1 }, liveNote(3, 64, 1, 1, 0)];
      }

      return {};
    });
    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(64, 1)]),
    );

    const result = await updateClip({ id: "123", code: "return notes" });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 1,
      detail: "1 muted note shortened by an overlapping note",
    });
  });

  it("says nothing when the code leaves the muted notes alone", async () => {
    mockMergeNoteTracking(mocks.clip123, [
      liveNote(1, 60, 0, 1, 0),
      liveNote(2, 67, 3, 1, 1),
    ]);
    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(60, 0)]),
    );

    const result = await updateClip({ id: "123", code: "return notes" });

    expect(result).not.toHaveProperty("detail");
  });

  it("says it once for the copies a tiled clip's code ran on", async () => {
    setupMidiClipMock(mocks.clip456, { length: 4 });

    for (const clip of [mocks.clip123, mocks.clip456]) {
      mockMergeNoteTracking(clip, [
        liveNote(1, 60, 0, 1, 0),
        liveNote(2, 64, 1, 1, 1),
      ]);
    }

    vi.mocked(executeNoteCode).mockResolvedValue(
      codeExecSuccess([codeNote(60, 0), codeNote(64, 1)]),
    );

    const reasons = newClipReasons();

    await applyCodeToWrittenClips(
      [{ id: "123" }, { id: "456" }],
      reasons,
      "123",
      0,
      1,
      "return notes",
    );

    expect(reasons.said.get("123")).toStrictEqual([
      "replaced 1 muted note at the same pitch and start",
    ]);
  });
});
