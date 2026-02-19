// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";

interface SetupMockOptions {
  path?: string;
  type?: LiveObjectType;
  properties?: Record<string, unknown>;
  methods?: Record<string, (...args: unknown[]) => unknown>;
}

type MethodQueueValue =
  | null
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>
  | ((...args: unknown[]) => unknown);
type MethodQueues = Record<string, MethodQueueValue[]>;

export const mockContext = {
  silenceWavPath: "/tmp/test-silence.wav",
} as const;

/**
 * Set up a mock track.
 * @param trackIndex - Track index
 * @param options - Optional mock properties/methods
 * @returns Registered track mock
 */
export function setupTrack(
  trackIndex: number,
  options: Omit<SetupMockOptions, "path" | "type"> = {},
): RegisteredMockObject {
  return registerMockObject(`track-${String(trackIndex)}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: {
      track_index: trackIndex,
      ...(options.properties ?? {}),
    },
    methods: options.methods,
  });
}

/**
 * Set up a mock live_set.
 * @param options - Optional mock properties/methods
 * @returns Registered live_set mock
 */
export function setupLiveSet(
  options: Omit<SetupMockOptions, "path" | "type"> = {},
): RegisteredMockObject {
  return registerMockObject("live-set", {
    path: "live_set",
    type: "Song",
    properties: options.properties,
    methods: options.methods,
  });
}

/**
 * Set up a mock scene.
 * @param sceneId - Scene ID
 * @param sceneIndex - Scene index
 * @param options - Optional mock properties/methods
 * @returns Registered scene mock
 */
export function setupScene(
  sceneId: string,
  sceneIndex: number,
  options: Omit<SetupMockOptions, "path" | "type"> = {},
): RegisteredMockObject {
  return registerMockObject(sceneId, {
    path: livePath.scene(sceneIndex),
    type: "Scene",
    properties: options.properties,
    methods: options.methods,
  });
}

/**
 * Set up a mock clip slot.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 * @param options - Optional mock properties/methods
 * @returns Registered clip slot mock
 */
export function setupClipSlot(
  trackIndex: number,
  sceneIndex: number,
  options: Omit<SetupMockOptions, "path" | "type"> = {},
): RegisteredMockObject {
  return registerMockObject(
    `clip-slot-${String(trackIndex)}-${String(sceneIndex)}`,
    {
      path: livePath.track(trackIndex).clipSlot(sceneIndex),
      type: "ClipSlot",
      properties: options.properties,
      methods: options.methods,
    },
  );
}

/**
 * Set up a mock clip.
 * @param clipId - Clip ID
 * @param options - Optional path/type/properties/methods
 * @returns Registered clip mock
 */
export function setupClip(
  clipId: string,
  options: SetupMockOptions = {},
): RegisteredMockObject {
  return registerMockObject(clipId, {
    type: "Clip",
    ...options,
  });
}

/**
 * Create a queue-backed method implementation.
 * @param values - Sequential return values or callback values
 * @param fallback - Fallback when queue is exhausted
 * @returns Function that returns queued values in order
 */
export function createQueuedMethod(
  values: MethodQueueValue[],
  fallback: (...args: unknown[]) => unknown = () => null,
): (...args: unknown[]) => unknown {
  let callIndex = 0;

  return (...args: unknown[]) => {
    const queued = values[callIndex];

    if (queued === undefined) {
      return fallback(...args);
    }

    callIndex += 1;

    if (typeof queued === "function") {
      return queued(...args);
    }

    return queued;
  };
}

/**
 * Register a track with queued method responses.
 * @param trackIndex - Track index
 * @param queues - Per-method queued return values
 * @returns Track LiveAPI object (shares .get/.set/.call mocks with registered mock)
 */
export function setupTrackWithQueuedMethods(
  trackIndex: number,
  queues: MethodQueues,
): LiveAPI {
  const methods = Object.fromEntries(
    Object.entries(queues).map(([method, values]) => [
      method,
      createQueuedMethod(values, () => null),
    ]),
  ) as Record<string, (...args: unknown[]) => unknown>;

  setupTrack(trackIndex, { methods });

  return LiveAPI.from(livePath.track(trackIndex));
}

/**
 * Register an arrangement clip.
 * @param clipId - Clip ID
 * @param trackIndex - Track index
 * @param properties - Clip property overrides
 * @param arrangementClipIndex - Arrangement clip index
 * @returns Clip LiveAPI object (shares .get/.set/.call mocks with registered mock)
 */
export function setupArrangementClip(
  clipId: string,
  trackIndex: number,
  properties: Record<string, unknown>,
  arrangementClipIndex: number = 0,
): LiveAPI {
  setupClip(clipId, {
    path: livePath.track(trackIndex).arrangementClip(arrangementClipIndex),
    properties,
  });

  return LiveAPI.from(`id ${clipId}`);
}
