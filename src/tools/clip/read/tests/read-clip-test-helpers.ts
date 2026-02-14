// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Test helper functions for read-clip tests
 */
import { expect } from "vitest";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
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
  trackIndex?: number;
  sceneIndex?: number;
  clipId?: string;
  path?: string;
}

interface SetupAudioClipMockOptions {
  clipProps: ClipProperties;
  trackIndex?: number;
  sceneIndex?: number;
  clipId?: string;
  path?: string;
}

interface ResolveClipPathOptions {
  trackIndex?: number;
  sceneIndex?: number;
  path?: string;
}

function resolveClipPath({
  trackIndex = 1,
  sceneIndex = 1,
  path,
}: ResolveClipPathOptions): string {
  if (path != null) {
    return path;
  }

  return livePath.track(trackIndex).clipSlot(sceneIndex).clip();
}

function defaultClipId(path: string): string {
  return path.replaceAll(/\s+/g, "/");
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
 * @param opts.trackIndex - Session track index (defaults to 1)
 * @param opts.sceneIndex - Session scene index (defaults to 1)
 * @param opts.clipId - Explicit clip ID for registry
 * @param opts.path - Explicit clip path (overrides trackIndex/sceneIndex)
 * @returns Handle for the registered clip
 */
export function setupMidiClipMock({
  notes = defaultTestNotes,
  clipProps,
  trackIndex,
  sceneIndex,
  clipId,
  path,
}: SetupMidiClipMockOptions): RegisteredMockObject {
  const clipPath = resolveClipPath({ trackIndex, sceneIndex, path });

  return registerMockObject(clipId ?? defaultClipId(clipPath), {
    path: clipPath,
    properties: {
      is_midi_clip: 1,
      ...clipProps,
    },
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
 * @param opts.trackIndex - Session track index (defaults to 1)
 * @param opts.sceneIndex - Session scene index (defaults to 1)
 * @param opts.clipId - Explicit clip ID for registry
 * @param opts.path - Explicit clip path (overrides trackIndex/sceneIndex)
 * @returns Handle for the registered clip
 */
export function setupAudioClipMock({
  clipProps,
  trackIndex,
  sceneIndex,
  clipId,
  path,
}: SetupAudioClipMockOptions): RegisteredMockObject {
  const clipPath = resolveClipPath({ trackIndex, sceneIndex, path });

  return registerMockObject(clipId ?? defaultClipId(clipPath), {
    path: clipPath,
    properties: {
      is_midi_clip: 0,
      ...clipProps,
    },
  });
}

/**
 * Override call mocking to return notes for get_notes_extended.
 * @param handle - Mock handle for the clip
 * @param notes - Notes array
 */
export function setupNotesMock(
  handle: RegisteredMockObject,
  notes: TestNote[],
): void {
  handle.call.mockImplementation((method: string) => {
    if (method === "get_notes_extended") {
      return JSON.stringify({ notes });
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
 * @param handle - Mock handle for the clip
 * @param clipLength - The clip length in Ableton beats (default 4)
 */
export function expectGetNotesExtendedCall(
  handle: RegisteredMockObject,
  clipLength = 4,
): void {
  const expectedArgs: unknown[] = ["get_notes_extended", 0, 128, 0, clipLength];

  expect(handle.call).toHaveBeenCalledWith(...expectedArgs);
}
