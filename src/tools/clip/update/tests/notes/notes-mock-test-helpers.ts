// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/**
 * Build a raw note as returned by the Live API (with the extra props that are
 * stripped before re-add).
 * @param pitch - MIDI pitch
 * @param startTime - Note start in Ableton beats
 * @param noteId - Live note id
 * @returns The raw note object
 */
export function rawNote(pitch: number, startTime: number, noteId: number) {
  return {
    note_id: noteId,
    pitch,
    start_time: startTime,
    duration: 1,
    velocity: 100,
    mute: 0,
    probability: 1,
    velocity_deviation: 0,
    release_velocity: 64,
  };
}

/**
 * Build a mock clip that returns `existingNotes` from get_notes_extended and
 * captures every note passed to add_new_notes into the returned `addedNotes`.
 * @param existingNotes - Notes the mock returns from get_notes_extended
 * @param length - Clip length in beats
 * @returns The mock clip plus the captured addedNotes array
 */
export function makeNotesMockClip<T extends object = Record<string, number>>(
  existingNotes: object[],
  length = 4,
): {
  mockClip: {
    getProperty: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
  };
  addedNotes: T[];
} {
  const addedNotes: T[] = [];
  const mockClip = {
    getProperty: vi.fn((prop: string) => (prop === "length" ? length : 0)),
    call: vi.fn((method: string, ...args: unknown[]) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: existingNotes });
      }

      if (method === "add_new_notes") {
        addedNotes.push(...(args[0] as { notes: T[] }).notes);
      }

      return "[]";
    }),
  };

  return { mockClip, addedNotes };
}

/**
 * Register a Live Set in a scale rooted at C, so a transform can read its
 * pitch classes.
 * @param intervals - Scale intervals above the root
 */
export function registerScaledLiveSet(intervals: number[]): void {
  registerMockObject("live_set", {
    path: "live_set",
    type: "Song",
    properties: { scale_mode: 1, root_note: 0, scale_intervals: intervals },
  });
}
