// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

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
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const track = registerMockObject("track-0", {
    path: livePath.track(0),
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

  const liveSet = registerLiveSetWithScenes(sceneIds);

  registerMockObject("track-0", { path: livePath.track(0) });

  const clipSlot = registerMockObject("clip-slot-0-0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: hasClip },
  });

  const clip = registerMockObject("audio_clip_0_0", {
    path: livePath.track(0).clipSlot(0).clip(),
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

  const liveSet = registerLiveSetWithTimeSig();

  const track = registerMockObject("track-0", {
    path: livePath.track(0),
    methods: {
      create_audio_clip: () => ["id", "arrangement_audio_clip"],
    },
  });

  const clip = registerMockObject("arrangement_audio_clip", {
    properties: { length: clipLength },
  });

  return { liveSet, track, clip };
}

/**
 * Assert that no timing/looping properties were set on an audio clip.
 * Audio clips have their timing managed by the sample, not by clip properties.
 * @param clip - Mock handle for the clip
 */
export function expectNoTimingProperties(clip: RegisteredMockObject): void {
  expect(clip.set).not.toHaveBeenCalledWith("loop_start", expect.anything());
  expect(clip.set).not.toHaveBeenCalledWith("loop_end", expect.anything());
  expect(clip.set).not.toHaveBeenCalledWith("start_marker", expect.anything());
}

interface SetupMultiSessionAudioMocksOptions {
  sceneIds?: string[];
  clipLength?: number;
}

export interface MultiSessionAudioClipMockHandles {
  liveSet: RegisteredMockObject;
  clipSlots: RegisteredMockObject[];
}

/**
 * Setup mocks for creating multiple session audio clips across clip slots.
 * Registers LiveSet (time signature + scenes), Track, and multiple ClipSlots with clips.
 * @param slotIndices - Array of scene indices (e.g., [0, 1])
 * @param options - Configuration options
 * @param options.sceneIds - Scene IDs for the live set (default: generated from slotIndices)
 * @param options.clipLength - Length of each clip in beats (default: 4)
 * @returns Handles for registered mock objects
 */
export function setupMultiSessionAudioClipMocks(
  slotIndices: number[],
  options: SetupMultiSessionAudioMocksOptions = {},
): MultiSessionAudioClipMockHandles {
  const { sceneIds = slotIndices.map((i) => `scene_${i}`), clipLength = 4 } =
    options;

  const liveSet = registerLiveSetWithScenes(sceneIds);

  registerMockObject("track-0", { path: livePath.track(0) });

  const clipSlots = slotIndices.map((i) => {
    const clipSlot = registerMockObject(`clip-slot-0-${i}`, {
      path: livePath.track(0).clipSlot(i),
      properties: { has_clip: 0 },
    });

    registerMockObject(`audio_clip_0_${i}`, {
      path: livePath.track(0).clipSlot(i).clip(),
      properties: { length: clipLength },
    });

    return clipSlot;
  });

  return { liveSet, clipSlots };
}

interface SetupMultiAudioArrangementMocksOptions {
  clipLength?: number;
}

export interface MultiAudioArrangementMockHandles {
  track: RegisteredMockObject;
}

/**
 * Setup mocks for creating multiple audio clips in arrangement view.
 * Registers LiveSet (time signature), Track (create_audio_clip with counter), and clips.
 * @param clipCount - Number of clips to register
 * @param options - Configuration options
 * @param options.clipLength - Length of each clip in beats (default: 4)
 * @returns Handles for registered mock objects
 */
export function setupMultiAudioArrangementClipMocks(
  clipCount: number,
  options: SetupMultiAudioArrangementMocksOptions = {},
): MultiAudioArrangementMockHandles {
  const { clipLength = 4 } = options;

  let clipCounter = 0;

  registerLiveSetWithTimeSig();

  const track = registerMockObject("track-0", {
    path: livePath.track(0),
    methods: {
      create_audio_clip: () => [
        "id",
        `arrangement_audio_clip_${clipCounter++}`,
      ],
    },
  });

  for (let i = 0; i < clipCount; i++) {
    registerMockObject(`arrangement_audio_clip_${i}`, {
      properties: { length: clipLength },
    });
  }

  return { track };
}

export interface DualMockHandles {
  clipSlot: RegisteredMockObject;
  sessionClip: RegisteredMockObject;
  track: RegisteredMockObject;
  arrangementClip: RegisteredMockObject;
}

/**
 * Setup mocks for dual session + arrangement clip creation tests.
 * Reuses arrangement mocks and adds session-specific ClipSlot and clip.
 * @returns Handles for all registered mock objects
 */
export function setupDualMocks(): DualMockHandles {
  const { track, clip: arrangementClip } = setupArrangementClipMocks();

  const clipSlot = registerMockObject("live_set/tracks/0/clip_slots/0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 0 },
  });

  const sessionClip = registerMockObject(
    "live_set/tracks/0/clip_slots/0/clip",
    { path: livePath.track(0).clipSlot(0).clip() },
  );

  return { clipSlot, sessionClip, track, arrangementClip };
}

/**
 * Setup mocks for session clip tests.
 * @param opts - Options for mock properties
 * @param opts.liveSet - Properties for the live set
 * @param opts.clipSlot - Properties for the clip slot
 * @param opts.clip - Properties for the clip
 * @returns Handles for clip slot and clip mocks
 */
export function setupSessionMocks(
  opts: {
    liveSet?: Record<string, unknown>;
    clipSlot?: Record<string, unknown>;
    clip?: Record<string, unknown>;
  } = {},
): { clipSlot: RegisteredMockObject; clip: RegisteredMockObject } {
  registerMockObject("live-set", {
    path: "live_set",
    properties: opts.liveSet,
  });
  const clipSlot = registerMockObject("live_set/tracks/0/clip_slots/0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 0, ...opts.clipSlot },
  });
  const clip = registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: opts.clip,
  });

  return { clipSlot, clip };
}

/**
 * Register a LiveSet mock with 4/4 time signature and scene children.
 * @param sceneIds - Scene IDs for the live set
 * @returns The registered LiveSet mock object
 */
function registerLiveSetWithScenes(sceneIds: string[]): RegisteredMockObject {
  return registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      scenes: children(...sceneIds),
    },
  });
}

/**
 * Register a LiveSet mock with 4/4 time signature (no scenes).
 * @returns The registered LiveSet mock object
 */
function registerLiveSetWithTimeSig(): RegisteredMockObject {
  return registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}
