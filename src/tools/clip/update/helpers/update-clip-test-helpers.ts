// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

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

/**
 * Setup function for mock Live API implementations used across update-clip tests.
 * Should be called in a beforeEach hook in each test file.
 */
export function setupMocks(): void {
  // Track added notes per clip ID for get_notes_extended mocking
  const addedNotesByClipId: Record<string, unknown[]> = {};

  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    switch (this._path) {
      case "id 123":
        return "123";
      case "id 456":
        return "456";
      case "id 789":
        return "789";
      case "id 999":
        return "999";
      default:
        return this._id;
    }
  });

  liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
    switch (this._id) {
      case "123":
        return "live_set tracks 0 clip_slots 0 clip";
      case "456":
        return "live_set tracks 1 clip_slots 1 clip";
      case "789":
        return "live_set tracks 2 arrangement_clips 0";
      case "999":
        return "live_set tracks 3 arrangement_clips 1";
      default:
        return this._path;
    }
  });

  // Mock liveApiCall to track added notes and return them for get_notes_extended
  liveApiCall.mockImplementation(function (
    this: MockLiveAPIContext,
    method: string,
    ...args: unknown[]
  ) {
    const id = this.id ?? this._id;

    if (method === "add_new_notes") {
      // Store the notes for this clip ID
      const firstArg = args[0] as { notes?: unknown[] } | undefined;

      if (id) {
        addedNotesByClipId[id] = firstArg?.notes ?? [];
      }
    } else if (method === "get_notes_extended") {
      // Return the notes that were previously added for this clip
      const notes = id ? (addedNotesByClipId[id] ?? []) : [];

      return JSON.stringify({ notes });
    }
  });
}

/**
 * Setup liveApiPath mock for arrangement clip tests.
 * @param trackIndex - Track index
 * @param clipIds - Array of clip IDs that should return the track's arrangement_clips path, or predicate function
 */
export function setupArrangementClipPath(
  trackIndex: number,
  clipIds: string[] | ((id: string | undefined) => boolean),
): void {
  const matchesClipId: (id: string | undefined) => boolean = Array.isArray(
    clipIds,
  )
    ? (id) =>
        id !== undefined &&
        (clipIds.includes(id) || clipIds.includes(String(id)))
    : clipIds;

  liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
    if (matchesClipId(this._id)) {
      return `live_set tracks ${trackIndex} arrangement_clips 0`;
    }

    if (this._path === "live_set") {
      return "live_set";
    }

    if (this._path === `live_set tracks ${trackIndex}`) {
      return `live_set tracks ${trackIndex}`;
    }

    return this._path;
  });
}

/**
 * Assert that source clip end_marker was set correctly.
 * @param clipId - Source clip ID (without "id " prefix)
 * @param expectedEndMarker - Expected end marker value
 */
export function assertSourceClipEndMarker(
  clipId: string,
  expectedEndMarker: number,
): void {
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "end_marker",
    expectedEndMarker,
  );
}

interface MidiClipMockOptions {
  /** Whether clip is looping (0 or 1) */
  looping?: number;
  /** Clip length in beats */
  length?: number;
  [key: string]: unknown;
}

/**
 * Setup mockLiveApiGet for a standard session MIDI clip.
 * @param clipId - Clip ID
 * @param opts - Additional clip properties
 * @param opts.looping - Whether clip is looping (0 or 1)
 * @param opts.length - Clip length in beats
 */
export function setupMidiClipMock(
  clipId: string,
  opts: MidiClipMockOptions = {},
): void {
  mockLiveApiGet({
    [clipId]: {
      is_arrangement_clip: 0,
      is_midi_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      ...opts,
    },
  });
}

/**
 * Setup mockLiveApiGet for a standard session audio clip.
 * @param clipId - Clip ID
 * @param opts - Additional clip properties
 */
export function setupAudioClipMock(
  clipId: string,
  opts: Record<string, unknown> = {},
): void {
  mockLiveApiGet({
    [clipId]: {
      is_arrangement_clip: 0,
      is_midi_clip: 0,
      is_audio_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      ...opts,
    },
  });
}
