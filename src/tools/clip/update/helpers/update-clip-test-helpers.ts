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

interface AudioClipMockOptions {
  clipId: string;
  trackIndex: number;
  /** End time in beats (arrangement visible length) */
  endTime: number;
  /** Start marker position */
  startMarker?: number;
  /** Clip name */
  name?: string;
}

interface AudioClipMockData {
  is_arrangement_clip: number;
  is_midi_clip: number;
  is_audio_clip: number;
  looping: number;
  warping: number;
  start_time: number;
  end_time: number;
  start_marker: number;
  end_marker: number;
  loop_start: number;
  loop_end: number;
  name: string;
  trackIndex: number;
}

/**
 * Build standard audio clip mock data for arrangement length tests.
 * @param opts - Options
 * @param opts.clipId - Clip ID
 * @param opts.trackIndex - Track index
 * @param opts.endTime - End time in beats (arrangement visible length)
 * @param opts.startMarker - Start marker position
 * @param opts.name - Clip name
 * @returns Clip mock data object keyed by clip ID
 */
export function buildAudioClipMock({
  clipId,
  trackIndex,
  endTime,
  startMarker = 0,
  name = "Audio Clip",
}: AudioClipMockOptions): Record<string, AudioClipMockData> {
  // end_marker = startMarker + visibleLength (endTime)
  const endMarker = startMarker + endTime;

  // Use "id X" format for keys to match liveApiId mock behavior
  return {
    [`id ${clipId}`]: {
      is_arrangement_clip: 1,
      is_midi_clip: 0,
      is_audio_clip: 1,
      looping: 0,
      warping: 1,
      start_time: 0.0,
      end_time: endTime,
      start_marker: startMarker,
      end_marker: endMarker,
      loop_start: startMarker,
      loop_end: endMarker,
      name,
      trackIndex,
    },
  };
}

interface RevealedClipMockOptions {
  clipId: string;
  trackIndex: number;
  /** Start time (where clip begins in arrangement) */
  startTime: number;
  endTime: number;
  startMarker: number;
  endMarker: number;
}

interface RevealedClipMockData {
  is_arrangement_clip: number;
  is_midi_clip: number;
  is_audio_clip: number;
  looping: number;
  start_time: number;
  end_time: number;
  start_marker: number;
  end_marker: number;
  trackIndex: number;
}

/**
 * Build revealed clip mock data for arrangement length tests.
 * @param opts - Options
 * @param opts.clipId - Revealed clip ID
 * @param opts.trackIndex - Track index
 * @param opts.startTime - Start time (where clip begins in arrangement)
 * @param opts.endTime - End time
 * @param opts.startMarker - Start marker position
 * @param opts.endMarker - End marker position
 * @returns Clip mock data object keyed by clip ID
 */
export function buildRevealedClipMock({
  clipId,
  trackIndex,
  startTime,
  endTime,
  startMarker,
  endMarker,
}: RevealedClipMockOptions): Record<string, RevealedClipMockData> {
  // Use "id X" format for keys to match liveApiId mock behavior
  return {
    [`id ${clipId}`]: {
      is_arrangement_clip: 1,
      is_midi_clip: 0,
      is_audio_clip: 1,
      looping: 0,
      start_time: startTime,
      end_time: endTime,
      start_marker: startMarker,
      end_marker: endMarker,
      trackIndex,
    },
  };
}

/**
 * Setup liveApiCall mock to return a revealed clip ID on duplicate_clip_to_arrangement.
 * @param revealedClipId - ID to return for duplicated clip
 */
export function setupDuplicateClipMock(revealedClipId: string): void {
  liveApiCall.mockImplementation(function (
    method: string,
    ..._args: unknown[]
  ): string[] | number {
    if (method === "duplicate_clip_to_arrangement") {
      return ["id", revealedClipId];
    }

    return 1;
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
  // Context uses "id X" format to match liveApiId mock
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: `id ${clipId}` }),
    "end_marker",
    expectedEndMarker,
  );
}

/**
 * Assert that duplicate_clip_to_arrangement was called correctly.
 * @param clipId - Source clip ID (without "id " prefix)
 * @param position - Position for the duplicated clip
 */
export function assertDuplicateClipCalled(
  clipId: string,
  position: number,
): void {
  // Construct "id X" format to match production LiveAPI.id behavior
  expect(liveApiCall).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    `id ${clipId}`,
    position,
  );
}

/**
 * Assert that revealed clip markers were set using the looping workaround.
 * @param clipId - Revealed clip ID (without "id " prefix)
 * @param startMarker - Expected start marker
 * @param endMarker - Expected end marker
 */
export function assertRevealedClipMarkers(
  clipId: string,
  startMarker: number,
  endMarker: number,
): void {
  // Context uses "id X" format to match liveApiId mock
  const ctx = expect.objectContaining({ id: `id ${clipId}` });

  expect(liveApiSet).toHaveBeenCalledWithThis(ctx, "looping", 1);
  expect(liveApiSet).toHaveBeenCalledWithThis(ctx, "loop_end", endMarker);
  expect(liveApiSet).toHaveBeenCalledWithThis(ctx, "loop_start", startMarker);
  expect(liveApiSet).toHaveBeenCalledWithThis(ctx, "end_marker", endMarker);
  expect(liveApiSet).toHaveBeenCalledWithThis(ctx, "start_marker", startMarker);
  expect(liveApiSet).toHaveBeenCalledWithThis(ctx, "looping", 0);
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

interface AudioArrangementTestOptions {
  trackIndex: number;
  clipId: string;
  revealedClipId: string;
  /** Source clip visible end time (arrangement length) */
  sourceEndTime: number;
  /** Target arrangement length in beats (e.g., 14 for "3:2") */
  targetLength: number;
  /** Source clip start marker */
  startMarker?: number;
  /** Clip name */
  name?: string;
}

/**
 * Setup a complete audio arrangement length test scenario.
 * @param opts - Options
 * @param opts.trackIndex - Track index
 * @param opts.clipId - Source clip ID
 * @param opts.revealedClipId - Revealed clip ID
 * @param opts.sourceEndTime - Source clip visible end time (arrangement length)
 * @param opts.targetLength - Target arrangement length in beats (e.g., 14 for "3:2")
 * @param opts.startMarker - Source clip start marker
 * @param opts.name - Clip name
 */
export function setupAudioArrangementTest({
  trackIndex,
  clipId,
  revealedClipId,
  sourceEndTime,
  targetLength,
  startMarker = 0,
  name = "Audio Clip",
}: AudioArrangementTestOptions): void {
  setupArrangementClipPath(trackIndex, [clipId, revealedClipId]);

  // Mock the id getter to return "id X" format (matching production behavior)
  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._id) {
      return `id ${this._id}`;
    }

    return this._id;
  });

  const sourceMock = buildAudioClipMock({
    clipId,
    trackIndex,
    endTime: sourceEndTime,
    startMarker,
    name,
  });

  // Calculate marker positions for revealed clip
  // visibleContentEnd = startMarker + sourceEndTime
  const visibleContentEnd = startMarker + sourceEndTime;
  // targetEndMarker = startMarker + targetLength
  const targetEndMarker = startMarker + targetLength;

  const revealedMock = buildRevealedClipMock({
    clipId: revealedClipId,
    trackIndex,
    startTime: sourceEndTime,
    endTime: targetLength,
    startMarker: visibleContentEnd,
    endMarker: targetEndMarker,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- merging typed mock objects
  mockLiveApiGet({ ...sourceMock, ...revealedMock } as any);
  setupDuplicateClipMock(revealedClipId);
}
