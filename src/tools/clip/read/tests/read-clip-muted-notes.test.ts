// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { readOneClip } from "#src/tools/clip/read/read-clip.ts";
import {
  createClipProps44,
  createTestNote,
  setupMidiClipMock,
} from "./read-clip-test-helpers.ts";

describe("readOneClip with muted notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  /**
   * Read a clip's notes.
   * @param notes - The clip's notes
   * @returns The read result
   */
  function readNotes(notes: object[]) {
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      notes: notes as ReturnType<typeof createTestNote>[],
      clipProps: createClipProps44(),
    });

    return readOneClip({ trackIndex: 0, sceneIndex: 0, include: ["notes"] });
  }

  it("hides a muted note and reports how many are hidden", () => {
    const result = readNotes([
      createTestNote({ pitch: 60, startTime: 0 }),
      { ...createTestNote({ pitch: 64, startTime: 2 }), mute: 1 },
    ]);

    expect(result.notes).toBe("v100 n/4 C3 1|1");
    expect(result.mutedNotes).toBe(1);
  });

  it("omits mutedNotes when no note is muted", () => {
    const result = readNotes([
      { ...createTestNote({ pitch: 60, startTime: 0 }), mute: 0 },
    ]);

    expect(result.notes).toBe("v100 n/4 C3 1|1");
    expect(result).not.toHaveProperty("mutedNotes");
  });

  it("reports mutedNotes and no notes for a clip of only muted notes", () => {
    const result = readNotes([
      { ...createTestNote({ pitch: 64, startTime: 2 }), mute: 1 },
      { ...createTestNote({ pitch: 67, startTime: 3 }), mute: 1 },
    ]);

    expect(result.notes).toBeUndefined();
    expect(result.mutedNotes).toBe(2);
  });
});
