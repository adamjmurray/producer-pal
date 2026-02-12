// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

const TRACK_0_PATH = "live_set tracks 0";

export interface ArrangementClipMockHandles {
  liveSet: RegisteredMockObject;
  track: RegisteredMockObject;
  clip: RegisteredMockObject;
}

/**
 * Setup mocks for arrangement clip creation tests.
 * Registers LiveSet (time signature), Track (create_midi_clip), and arrangement clip.
 * @returns Handles for registered mock objects
 */
export function setupArrangementClipMocks(): ArrangementClipMockHandles {
  const liveSet = registerMockObject("live-set", {
    path: "live_set",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const track = registerMockObject("track-0", {
    path: TRACK_0_PATH,
    methods: {
      create_midi_clip: () => ["id", "arrangement_clip"],
    },
  });

  const clip = registerMockObject("arrangement_clip", {
    properties: { length: 4 }, // 1 bar in 4/4 = 4 beats
  });

  return { liveSet, track, clip };
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
 * Assert that create_clip was called on the given clip slot handle.
 * @param clipSlot - Mock handle for the clip slot
 * @param expectedLength - Expected clip length in beats
 */
export function expectClipCreated(
  clipSlot: RegisteredMockObject,
  expectedLength: number,
): void {
  expect(clipSlot.call).toHaveBeenCalledWith("create_clip", expectedLength);
}

/**
 * Assert that add_new_notes was called on the given clip handle.
 * @param clip - Mock handle for the clip
 * @param notes - Expected notes array
 */
export function expectNotesAdded(
  clip: RegisteredMockObject,
  notes: Array<Record<string, number>>,
): void {
  expect(clip.call).toHaveBeenCalledWith("add_new_notes", { notes });
}

export interface SessionAudioClipMockHandles {
  liveSet: RegisteredMockObject;
  clipSlot: RegisteredMockObject;
  clip: RegisteredMockObject;
}

interface SetupSessionAudioMocksOptions {
  sceneIds?: string[];
  clipLength?: number;
  hasClip?: number;
}

/**
 * Setup mocks for session audio clip creation tests.
 * Registers LiveSet (time signature + scenes), Track, ClipSlot, and audio clip.
 * @param options - Configuration options
 * @param options.sceneIds - Scene IDs for the live set (default: ["scene_0"])
 * @param options.clipLength - Length of the clip in beats (default: 8)
 * @param options.hasClip - Whether the clip slot already has a clip (default: 0)
 * @returns Handles for registered mock objects
 */
export function setupSessionAudioClipMocks(
  options: SetupSessionAudioMocksOptions = {},
): SessionAudioClipMockHandles {
  const { sceneIds = ["scene_0"], clipLength = 8, hasClip = 0 } = options;

  const liveSet = registerMockObject("live-set", {
    path: "live_set",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      scenes: children(...sceneIds),
    },
  });

  registerMockObject("track-0", { path: "live_set tracks 0" });

  const clipSlot = registerMockObject("clip-slot-0-0", {
    path: "live_set tracks 0 clip_slots 0",
    properties: { has_clip: hasClip },
  });

  const clip = registerMockObject("audio_clip_0_0", {
    path: "live_set tracks 0 clip_slots 0 clip",
    properties: { length: clipLength },
  });

  return { liveSet, clipSlot, clip };
}

interface SetupAudioArrangementMocksOptions {
  clipLength?: number;
}

/**
 * Setup mocks for audio arrangement clip creation tests.
 * Registers LiveSet (time signature), Track (create_audio_clip), and audio clip.
 * @param options - Configuration options
 * @param options.clipLength - Length of the clip in beats (default: 8)
 * @returns Handles for registered mock objects
 */
export function setupAudioArrangementClipMocks(
  options: SetupAudioArrangementMocksOptions = {},
): ArrangementClipMockHandles {
  const { clipLength = 8 } = options;

  const liveSet = registerMockObject("live-set", {
    path: "live_set",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const track = registerMockObject("track-0", {
    path: TRACK_0_PATH,
    methods: {
      create_audio_clip: () => ["id", "arrangement_audio_clip"],
    },
  });

  const clip = registerMockObject("arrangement_audio_clip", {
    properties: { length: clipLength },
  });

  return { liveSet, track, clip };
}
