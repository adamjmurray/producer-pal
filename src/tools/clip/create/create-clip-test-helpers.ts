// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  liveApiCall,
  liveApiId,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

/**
 * Setup mocks for arrangement clip creation tests.
 * Configures LiveSet time signature and clip ID resolution.
 */
export function setupArrangementClipMocks(): void {
  mockLiveApiGet({
    Track: { exists: () => true },
    LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    arrangement_clip: { length: 4 }, // 1 bar in 4/4 = 4 beats
  });

  liveApiCall.mockImplementation((method, ..._args) => {
    if (method === "create_midi_clip") {
      return ["id", "arrangement_clip"];
    }

    return null;
  });

  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === "id arrangement_clip") {
      return "arrangement_clip";
    }

    return this._id;
  });
}

/**
 * Create a note object for assertions against Live API add_new_notes calls.
 * @param pitch - MIDI pitch number
 * @param startTime - Start time in beats
 * @param duration - Duration in beats
 * @param velocity - Velocity (default: 100)
 * @param probability - Probability (default: 1.0)
 * @param velocityDeviation - Velocity deviation (default: 0)
 * @returns Note object matching Live API format
 */
export function note(
  pitch: number,
  startTime: number,
  duration: number,
  velocity = 100,
  probability = 1.0,
  velocityDeviation = 0,
): Record<string, number> {
  return {
    pitch,
    start_time: startTime,
    duration,
    velocity,
    probability,
    velocity_deviation: velocityDeviation,
  };
}

/**
 * Assert that create_clip was called with the expected length.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 * @param expectedLength - Expected clip length in beats
 */
export function expectClipCreated(
  trackIndex: number,
  sceneIndex: number,
  expectedLength: number,
): void {
  expect(liveApiCall).toHaveBeenCalledWithThis(
    expect.objectContaining({
      path: `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    }),
    "create_clip",
    expectedLength,
  );
}

/**
 * Assert that add_new_notes was called with the expected notes.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 * @param notes - Expected notes array
 */
export function expectNotesAdded(
  trackIndex: number,
  sceneIndex: number,
  notes: Array<Record<string, number>>,
): void {
  expect(liveApiCall).toHaveBeenCalledWithThis(
    expect.objectContaining({
      path: `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`,
    }),
    "add_new_notes",
    { notes },
  );
}

interface SetupAudioArrangementMocksOptions {
  clipLength?: number;
}

/**
 * Setup mocks for audio arrangement clip creation tests.
 * Configures LiveSet time signature, audio clip creation, and clip ID resolution.
 * @param options - Configuration options
 * @param options.clipLength - Length of the clip in beats (default: 8)
 */
export function setupAudioArrangementClipMocks(
  options: SetupAudioArrangementMocksOptions = {},
): void {
  const { clipLength = 8 } = options;

  liveApiCall.mockImplementation((method, ..._args) => {
    if (method === "create_audio_clip") {
      return ["id", "arrangement_audio_clip"];
    }

    return null;
  });

  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === "id arrangement_audio_clip") {
      return "arrangement_audio_clip";
    }

    return this._id;
  });

  mockLiveApiGet({
    Track: { exists: () => true },
    LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    "id arrangement_audio_clip": { length: clipLength },
  });
}
