// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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

const REGION_END_PROPS = new Set(["length", "end_marker", "loop_end"]);

/**
 * A mock clip's getProperty: the region runs from 0 to `length`; everything
 * else reads 0.
 * @param length - Clip length in beats
 * @returns The getProperty implementation
 */
export function clipRegionProperty(length = 4): (prop: string) => number {
  return (prop) => (REGION_END_PROPS.has(prop) ? length : 0);
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
    getProperty: vi.fn(clipRegionProperty(length)),
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

export interface HeldNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  mute: number;
  probability: number;
  velocity_deviation: number;
  release_velocity: number;
}

export const held = (
  pitch: number,
  start_time: number,
  overrides: Partial<HeldNote> = {},
): HeldNote => ({
  pitch,
  start_time,
  duration: 1,
  velocity: 100,
  mute: 0,
  probability: 1,
  velocity_deviation: 0,
  release_velocity: 64,
  ...overrides,
});

/**
 * What Live keeps when notes are added: whichever of two same-pitch notes
 * starts earlier is cut at the later one's start.
 * @param notes - Notes as written
 * @returns The notes as Live would hold them
 */
export function liveKeeps(notes: HeldNote[]): HeldNote[] {
  const sorted = notes.toSorted(
    (a, b) => a.pitch - b.pitch || a.start_time - b.start_time,
  );

  return sorted.map((note, i) => {
    const next = sorted[i + 1];

    return next?.pitch === note.pitch &&
      next.start_time < note.start_time + note.duration
      ? { ...note, duration: next.start_time - note.start_time }
      : note;
  });
}

/**
 * A clip that holds notes the way Live does: the write goes through liveKeeps.
 * @param existing - Notes the clip starts with
 * @returns The clip
 */
export function liveClip(existing: HeldNote[]): LiveAPI {
  let notesInClip = existing;

  return {
    id: "123",
    getProperty: vi.fn(clipRegionProperty()),
    call: vi.fn((method: string, ...args: unknown[]) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: notesInClip });
      }

      if (method === "remove_notes_extended") {
        notesInClip = [];
      }

      if (method === "add_new_notes") {
        const notes = (args[0] as { notes: Partial<HeldNote>[] }).notes;

        notesInClip = liveKeeps(
          notes.map((n) => ({ ...writtenDefaults(), ...n }) as HeldNote),
        );
      }

      return "[]";
    }),
  } as unknown as LiveAPI;
}

/** @returns Defaults for the fields a freshly written note leaves out */
function writtenDefaults(): Partial<HeldNote> {
  return { mute: 0, probability: 1, velocity_deviation: 0 };
}
