// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Test helper functions for read-clip tests
 */
import { expect } from "vitest";
import { liveApiCall } from "#src/test/mocks/mock-live-api.ts";
import {
  type MockObjectHandle,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface TestNote {
  note_id?: number;
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability: number;
  velocity_deviation: number;
}

interface CreateTestNoteOptions {
  pitch?: number;
  startTime: number;
  duration?: number;
  velocity?: number;
}

interface ClipProperties {
  signature_numerator?: number;
  signature_denominator?: number;
  length?: number;
  start_marker?: number;
  end_marker?: number;
  loop_start?: number;
  loop_end?: number;
  [key: string]: unknown;
}

interface SetupMidiClipMockOptions {
  notes?: TestNote[];
  clipProps: ClipProperties;
}

interface SetupAudioClipMockOptions {
  clipProps: ClipProperties;
}

// Default test notes: C3, D3, E3 at beats 0, 1, 2
export const defaultTestNotes: TestNote[] = [
  {
    note_id: 1,
    pitch: 60,
    start_time: 0,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
  },
  {
    note_id: 2,
    pitch: 62,
    start_time: 1,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
  },
  {
    note_id: 3,
    pitch: 64,
    start_time: 2,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
  },
];

/**
 * Creates a test note object
 * @param opts - Options
 * @param opts.pitch - MIDI pitch (default 60 = C3)
 * @param opts.startTime - Start time in Ableton beats
 * @param opts.duration - Duration in beats
 * @param opts.velocity - Velocity
 * @returns Note object
 */
export function createTestNote(opts: CreateTestNoteOptions): TestNote {
  const { pitch = 60, startTime, duration = 1, velocity = 100 } = opts;

  return {
    pitch,
    start_time: startTime,
    duration,
    velocity,
    probability: 1.0,
    velocity_deviation: 0,
  };
}

/**
 * Helper to set up mocks for a MIDI clip with notes.
 * Registers a clip at "live_set tracks 1 clip_slots 1 clip".
 * @param opts - Options
 * @param opts.notes - Notes array (defaults to defaultTestNotes)
 * @param opts.clipProps - Clip properties to mock
 * @returns Handle for the registered clip
 */
export function setupMidiClipMock({
  notes = defaultTestNotes,
  clipProps,
}: SetupMidiClipMockOptions): MockObjectHandle {
  return registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
    path: "live_set tracks 1 clip_slots 1 clip",
    properties: clipProps,
    methods: {
      get_notes_extended: () => JSON.stringify({ notes }),
    },
  });
}

/**
 * Helper to set up mocks for an audio clip (no notes).
 * Registers a clip at "live_set tracks 1 clip_slots 1 clip".
 * @param opts - Options
 * @param opts.clipProps - Clip properties to mock
 * @returns Handle for the registered clip
 */
export function setupAudioClipMock({
  clipProps,
}: SetupAudioClipMockOptions): MockObjectHandle {
  return registerMockObject("live_set/tracks/1/clip_slots/1/clip", {
    path: "live_set tracks 1 clip_slots 1 clip",
    properties: {
      is_midi_clip: 0,
      ...clipProps,
    },
  });
}

/**
 * Override call mocking to return notes for get_notes_extended.
 * Supports both new handle-based form and legacy global form.
 * @param handleOrNotes - Mock handle (new form) OR notes array (legacy form)
 * @param notes - Notes array (new form)
 */
export function setupNotesMock(
  handleOrNotes: MockObjectHandle | TestNote[],
  notes?: TestNote[],
): void {
  const mockNotes = Array.isArray(handleOrNotes)
    ? handleOrNotes
    : (notes ?? []);

  if (Array.isArray(handleOrNotes)) {
    liveApiCall.mockImplementation((method: string) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: mockNotes });
      }

      return null;
    });

    return;
  }

  handleOrNotes.call.mockImplementation((method: string) => {
    if (method === "get_notes_extended") {
      return JSON.stringify({ notes: mockNotes });
    }

    return null;
  });
}

/**
 * Creates standard clip properties for 4/4 time
 * @param overrides - Properties to override
 * @returns Clip properties
 */
export function createClipProps44(
  overrides: ClipProperties = {},
): ClipProperties {
  return {
    signature_numerator: 4,
    signature_denominator: 4,
    length: 4,
    start_marker: 0,
    end_marker: 4,
    loop_start: 0,
    loop_end: 4,
    ...overrides,
  };
}

/**
 * Creates standard clip properties for 6/8 time
 * @param overrides - Properties to override
 * @returns Clip properties
 */
export function createClipProps68(
  overrides: ClipProperties = {},
): ClipProperties {
  return {
    signature_numerator: 6,
    signature_denominator: 8,
    length: 3, // One bar in 6/8 = 3 Ableton beats
    start_marker: 0,
    end_marker: 3,
    loop_start: 0,
    loop_end: 3,
    ...overrides,
  };
}

/**
 * Expect get_notes_extended was called with standard parameters.
 * Supports handle-based assertions (new) and global assertions by path (legacy).
 * @param handleOrPath - Mock handle (new) or clip path (legacy)
 * @param clipLength - The clip length in Ableton beats (default 4)
 */
export function expectGetNotesExtendedCall(
  handleOrPath: MockObjectHandle | string,
  clipLength = 4,
): void {
  const expectedArgs: unknown[] = ["get_notes_extended", 0, 128, 0, clipLength];

  if (typeof handleOrPath === "string") {
    const registered = lookupMockObject(undefined, handleOrPath);

    if (registered != null) {
      expect(registered.call).toHaveBeenCalledWith(...expectedArgs);

      return;
    }

    expect(liveApiCall).toHaveBeenCalledWith(...expectedArgs);

    return;
  }

  expect(handleOrPath.call).toHaveBeenCalledWith(...expectedArgs);
}
