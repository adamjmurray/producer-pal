// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { MockSequence } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import * as tilingHelpers from "#src/tools/shared/arrangement/arrangement-tiling.ts";

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

export interface UpdateClipMocks {
  clip123: RegisteredMockObject;
  clip456: RegisteredMockObject;
  clip789: RegisteredMockObject;
  clip999: RegisteredMockObject;
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
 * @returns Mocks for the 4 registered clip objects
 */
export function setupUpdateClipMocks(): UpdateClipMocks {
  return {
    clip123: registerMockObject("123", {
      path: livePath.track(0).clipSlot(0).clip(),
      methods: createNoteTrackingMethods(),
    }),
    clip456: registerMockObject("456", {
      path: livePath.track(1).clipSlot(1).clip(),
      methods: createNoteTrackingMethods(),
    }),
    clip789: registerMockObject("789", {
      path: livePath.track(2).arrangementClip(0),
      methods: createNoteTrackingMethods(),
    }),
    clip999: registerMockObject("999", {
      path: livePath.track(3).arrangementClip(1),
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
 * @returns Map of clip ID to registered mock (re-registered clips have fresh mocks)
 */
export function setupArrangementClipPath(
  trackIndex: number,
  clipIds: string[],
): Map<string, RegisteredMockObject> {
  registerMockObject("live-set", {
    path: "live_set",
    type: "Song",
  });
  const clips = new Map<string, RegisteredMockObject>();
  const duplicateIds = clipIds.slice(1);
  let duplicateIndex = 0;
  let tempMidiCounter = 0;

  for (const id of clipIds) {
    const clip = setupArrangementClip(trackIndex, id);

    clips.set(id, clip);
  }

  registerMockObject(`track-${trackIndex}`, {
    path: livePath.track(trackIndex),
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

  return clips;
}

function setupArrangementClip(
  trackIndex: number,
  id: string,
): RegisteredMockObject {
  return registerMockObject(id, {
    path: livePath.track(trackIndex).arrangementClip(0),
    type: "Clip",
    methods: createNoteTrackingMethods(),
  });
}

/**
 * Assert that source clip end_marker was set correctly.
 * @param clip - Registered mock clip
 * @param expectedEndMarker - Expected end marker value
 */
export function assertSourceClipEndMarker(
  clip: RegisteredMockObject,
  expectedEndMarker: number,
): void {
  expect(clip.set).toHaveBeenCalledWith("end_marker", expectedEndMarker);
}

interface MidiClipMockOptions {
  /** Whether clip is looping (0 or 1) */
  looping?: number;
  /** Clip length in beats */
  length?: number;
  [key: string]: unknown;
}

/**
 * Override a clip's get mock for a standard session MIDI clip.
 * Preserves the clip's call mock (e.g., note tracking from setupUpdateClipMocks).
 * @param clip - Registered mock clip
 * @param opts - Additional clip properties
 * @param opts.looping - Whether clip is looping (0 or 1)
 * @param opts.length - Clip length in beats
 */
export function setupMidiClipMock(
  clip: RegisteredMockObject,
  opts: MidiClipMockOptions = {},
): void {
  const properties: Record<string, unknown> = {
    is_arrangement_clip: 0,
    is_midi_clip: 1,
    signature_numerator: 4,
    signature_denominator: 4,
    ...opts,
  };
  const callCounts: Record<string, number> = {};

  clip.get.mockImplementation((prop: string) => {
    const value = properties[prop];

    if (value !== undefined) {
      if (value instanceof MockSequence) {
        const index = callCounts[prop] ?? 0;

        callCounts[prop] = index + 1;

        return [value[index]];
      }

      return [value];
    }

    return [0];
  });
}

/**
 * Override a clip's get mock for a standard session audio clip.
 * Preserves the clip's call mock (e.g., note tracking from setupUpdateClipMocks).
 * @param clip - Registered mock clip
 * @param opts - Additional clip properties
 */
export function setupAudioClipMock(
  clip: RegisteredMockObject,
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
  const callCounts: Record<string, number> = {};

  clip.get.mockImplementation((prop: string) => {
    const value = properties[prop];

    if (value !== undefined) {
      if (value instanceof MockSequence) {
        const index = callCounts[prop] ?? 0;

        callCounts[prop] = index + 1;

        return [value[index]];
      }

      return [value];
    }

    return [0];
  });
}

/**
 * Override a clip's get mock for an arrangement audio clip.
 * @param clip - Registered mock clip
 * @param opts - Additional clip properties
 */
export function setupArrangementAudioClipMock(
  clip: RegisteredMockObject,
  opts: Record<string, unknown> = {},
): void {
  setupAudioClipMock(clip, {
    is_arrangement_clip: 1,
    ...opts,
  });
}

/**
 * Override a clip's get mock for an arrangement MIDI clip.
 * @param clip - Registered mock clip
 * @param opts - Additional clip properties
 */
export function setupArrangementMidiClipMock(
  clip: RegisteredMockObject,
  opts: MidiClipMockOptions = {},
): void {
  setupMidiClipMock(clip, {
    is_arrangement_clip: 1,
    ...opts,
  });
}

/**
 * Set up properties on a mock object, preserving existing property logic for
 * properties not specified in `props`. Supports MockSequence.
 * @param mock - Registered mock object
 * @param props - Properties to set on the mock
 */
export function setupMockProperties(
  mock: RegisteredMockObject,
  props: Record<string, unknown>,
): void {
  const fallbackGet = mock.get.getMockImplementation();
  const callCounts: Record<string, number> = {};

  mock.get.mockImplementation((prop: string) => {
    const value = props[prop];

    if (value !== undefined) {
      if (value instanceof MockSequence) {
        const index = callCounts[prop] ?? 0;

        callCounts[prop] = index + 1;

        return [value[index]];
      }

      return [value];
    }

    if (fallbackGet) {
      return fallbackGet(prop);
    }

    return [0];
  });
}

/**
 * Set up mocks for session-based file content boundary detection.
 * @param fileContentBoundary - File's actual content length (returned by getProperty("end_marker"))
 * @returns Mock objects for assertions
 */
export function setupSessionTilingMock(fileContentBoundary = 8.0) {
  const sessionClip = {
    id: "session-temp",
    set: vi.fn(),
    getProperty: vi.fn().mockImplementation((prop: string) => {
      if (prop === "end_marker") return fileContentBoundary;

      return null;
    }),
  };
  const sessionSlot = {
    call: vi.fn(),
  };
  const mockCreate = vi
    .spyOn(tilingHelpers, "createAudioClipInSession")
    .mockReturnValue({
      clip: sessionClip as unknown as LiveAPI,
      slot: sessionSlot as unknown as LiveAPI,
    });

  return { mockCreate, sessionClip, sessionSlot };
}
