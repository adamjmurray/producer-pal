// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface NoteOptions {
  /** Note duration in beats */
  duration?: number;
  /** Note velocity (0-127) */
  velocity?: number;
  /** Note probability (0-1) */
  probability?: number;
  /** Velocity deviation (-127 to 127) */
  velocityDeviation?: number;
}

interface Note {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability: number;
  velocity_deviation: number;
}

/**
 * Creates a standard MIDI note object for testing.
 * @param pitch - MIDI pitch (e.g., 60 = C3)
 * @param startTime - Start time in beats
 * @param opts - Additional note properties
 * @param opts.duration - Note duration in beats
 * @param opts.velocity - Note velocity (0-127)
 * @param opts.probability - Note probability (0-1)
 * @param opts.velocityDeviation - Velocity deviation (-127 to 127)
 * @returns Note object for Live API
 */
export function note(
  pitch: number,
  startTime = 0,
  opts: NoteOptions = {},
): Note {
  return {
    pitch,
    start_time: startTime,
    duration: opts.duration ?? 1,
    velocity: opts.velocity ?? 100,
    probability: opts.probability ?? 1,
    velocity_deviation: opts.velocityDeviation ?? 0,
  };
}

/**
 * Shared mock context for update-clip tests
 */
export const mockContext = {
  holdingAreaStartBeats: 40000,
};

export interface UpdateClipMockHandles {
  clip123: MockObjectHandle;
  clip456: MockObjectHandle;
  clip789: MockObjectHandle;
  clip999: MockObjectHandle;
}

/**
 * Create note-tracking method implementations for a clip.
 * Tracks notes added via add_new_notes and returns them for get_notes_extended.
 * @returns Method implementations for registerMockObject
 */
function createNoteTrackingMethods(): Record<
  string,
  (...args: unknown[]) => unknown
> {
  let notes: unknown[] = [];

  return {
    add_new_notes: (arg: unknown) => {
      const data = arg as { notes?: unknown[] } | null | undefined;

      notes = data?.notes ?? [];
    },
    get_notes_extended: () => JSON.stringify({ notes }),
  };
}

/**
 * Setup function for mock Live API implementations used across update-clip tests.
 * Registers 4 clip objects with note tracking. Should be called in beforeEach.
 * @returns Handles for the 4 registered clip objects
 */
export function setupMocks(): UpdateClipMockHandles {
  return {
    clip123: registerMockObject("123", {
      path: "live_set tracks 0 clip_slots 0 clip",
      methods: createNoteTrackingMethods(),
    }),
    clip456: registerMockObject("456", {
      path: "live_set tracks 1 clip_slots 1 clip",
      methods: createNoteTrackingMethods(),
    }),
    clip789: registerMockObject("789", {
      path: "live_set tracks 2 arrangement_clips 0",
      methods: createNoteTrackingMethods(),
    }),
    clip999: registerMockObject("999", {
      path: "live_set tracks 3 arrangement_clips 1",
      methods: createNoteTrackingMethods(),
    }),
  };
}

/**
 * Register arrangement clip path for tests. Also registers LiveSet and Track objects
 * for production code lookups. Re-registers each clipId with the arrangement path.
 * @param trackIndex - Track index
 * @param clipIds - Arrangement clip IDs. First entry is source clip; remaining
 * entries are the duplicate clip IDs expected in call order.
 * @returns Map of clip ID to new handle (re-registered clips have fresh handles)
 */
export function setupArrangementClipPath(
  trackIndex: number,
  clipIds: string[],
): Map<string, MockObjectHandle> {
  registerMockObject("live-set", {
    path: "live_set",
    type: "LiveSet",
  });
  const handles = new Map<string, MockObjectHandle>();
  const duplicateIds = clipIds.slice(1);
  let duplicateIndex = 0;
  let tempMidiCounter = 0;

  for (const id of clipIds) {
    const handle = registerArrangementClipHandle(trackIndex, id);

    handles.set(id, handle);
  }

  registerMockObject(`track-${trackIndex}`, {
    path: `live_set tracks ${trackIndex}`,
    type: "Track",
    properties: {
      track_index: trackIndex,
    },
    methods: {
      duplicate_clip_to_arrangement: () => {
        const id = duplicateIds[duplicateIndex];

        if (id == null) {
          throw new Error(
            `Test setup error: missing duplicate clip ID for call ${String(duplicateIndex + 1)} on track ${String(trackIndex)}`,
          );
        }

        duplicateIndex += 1;

        return `id ${id}`;
      },
      create_midi_clip: () => {
        tempMidiCounter += 1;

        return `id temp_midi_${String(tempMidiCounter)}`;
      },
      delete_clip: () => null,
    },
  });

  return handles;
}

function registerArrangementClipHandle(
  trackIndex: number,
  id: string,
): MockObjectHandle {
  return registerMockObject(id, {
    path: `live_set tracks ${trackIndex} arrangement_clips 0`,
    type: "Clip",
    methods: createNoteTrackingMethods(),
  });
}

/**
 * Assert that source clip end_marker was set correctly.
 * @param handle - Mock handle for the clip
 * @param expectedEndMarker - Expected end marker value
 */
export function assertSourceClipEndMarker(
  handle: MockObjectHandle,
  expectedEndMarker: number,
): void {
  expect(handle.set).toHaveBeenCalledWith("end_marker", expectedEndMarker);
}

interface MidiClipMockOptions {
  /** Whether clip is looping (0 or 1) */
  looping?: number;
  /** Clip length in beats */
  length?: number;
  [key: string]: unknown;
}

/**
 * Override a handle's get mock for a standard session MIDI clip.
 * Preserves the handle's call mock (e.g., note tracking from setupMocks).
 * @param handle - Mock handle for the clip
 * @param opts - Additional clip properties
 * @param opts.looping - Whether clip is looping (0 or 1)
 * @param opts.length - Clip length in beats
 */
export function setupMidiClipMock(
  handle: MockObjectHandle,
  opts: MidiClipMockOptions = {},
): void {
  const properties: Record<string, unknown> = {
    is_arrangement_clip: 0,
    is_midi_clip: 1,
    signature_numerator: 4,
    signature_denominator: 4,
    ...opts,
  };

  handle.get.mockImplementation((prop: string) => {
    const value = properties[prop];

    if (value !== undefined) {
      return [value];
    }

    return [0];
  });
}

/**
 * Override a handle's get mock for a standard session audio clip.
 * Preserves the handle's call mock (e.g., note tracking from setupMocks).
 * @param handle - Mock handle for the clip
 * @param opts - Additional clip properties
 */
export function setupAudioClipMock(
  handle: MockObjectHandle,
  opts: Record<string, unknown> = {},
): void {
  const properties: Record<string, unknown> = {
    is_arrangement_clip: 0,
    is_midi_clip: 0,
    is_audio_clip: 1,
    signature_numerator: 4,
    signature_denominator: 4,
    ...opts,
  };

  handle.get.mockImplementation((prop: string) => {
    const value = properties[prop];

    if (value !== undefined) {
      return [value];
    }

    return [0];
  });
}
