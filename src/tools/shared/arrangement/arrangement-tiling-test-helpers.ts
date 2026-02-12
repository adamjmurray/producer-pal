// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface RegisterHandleOptions {
  path?: string;
  type?: string;
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
 * Register a track object handle.
 * @param trackIndex - Track index
 * @param options - Optional mock properties/methods
 * @returns Registered track handle
 */
export function registerTrackHandle(
  trackIndex: number,
  options: Omit<RegisterHandleOptions, "path" | "type"> = {},
): MockObjectHandle {
  return registerMockObject(`track-${String(trackIndex)}`, {
    path: `live_set tracks ${String(trackIndex)}`,
    type: "Track",
    properties: {
      track_index: trackIndex,
      ...(options.properties ?? {}),
    },
    methods: options.methods,
  });
}

/**
 * Register the live_set object handle.
 * @param options - Optional mock properties/methods
 * @returns Registered live_set handle
 */
export function registerLiveSetHandle(
  options: Omit<RegisterHandleOptions, "path" | "type"> = {},
): MockObjectHandle {
  return registerMockObject("live-set", {
    path: "live_set",
    type: "LiveSet",
    properties: options.properties,
    methods: options.methods,
  });
}

/**
 * Register a scene object handle.
 * @param sceneId - Scene ID
 * @param sceneIndex - Scene index
 * @param options - Optional mock properties/methods
 * @returns Registered scene handle
 */
export function registerSceneHandle(
  sceneId: string,
  sceneIndex: number,
  options: Omit<RegisterHandleOptions, "path" | "type"> = {},
): MockObjectHandle {
  return registerMockObject(sceneId, {
    path: `live_set scenes ${String(sceneIndex)}`,
    type: "Scene",
    properties: options.properties,
    methods: options.methods,
  });
}

/**
 * Register a clip slot object handle.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 * @param options - Optional mock properties/methods
 * @returns Registered clip slot handle
 */
export function registerClipSlotHandle(
  trackIndex: number,
  sceneIndex: number,
  options: Omit<RegisterHandleOptions, "path" | "type"> = {},
): MockObjectHandle {
  return registerMockObject(
    `clip-slot-${String(trackIndex)}-${String(sceneIndex)}`,
    {
      path: `live_set tracks ${String(trackIndex)} clip_slots ${String(sceneIndex)}`,
      type: "ClipSlot",
      properties: options.properties,
      methods: options.methods,
    },
  );
}

/**
 * Register a clip object handle.
 * @param clipId - Clip ID
 * @param options - Optional path/type/properties/methods
 * @returns Registered clip handle
 */
export function registerClipHandle(
  clipId: string,
  options: RegisterHandleOptions = {},
): MockObjectHandle {
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
 * Register a track with queued method responses and return both handle and LiveAPI.
 * @param trackIndex - Track index
 * @param queues - Per-method queued return values
 * @returns Track LiveAPI object and handle
 */
export function registerTrackWithQueuedMethods(
  trackIndex: number,
  queues: MethodQueues,
): {
  track: LiveAPI;
  trackHandle: MockObjectHandle;
} {
  const methods = Object.fromEntries(
    Object.entries(queues).map(([method, values]) => [
      method,
      createQueuedMethod(values, () => null),
    ]),
  ) as Record<string, (...args: unknown[]) => unknown>;

  const trackHandle = registerTrackHandle(trackIndex, { methods });

  return {
    track: LiveAPI.from(`live_set tracks ${String(trackIndex)}`),
    trackHandle,
  };
}

/**
 * Register an arrangement clip and return both handle and LiveAPI object.
 * @param clipId - Clip ID
 * @param trackIndex - Track index
 * @param properties - Clip property overrides
 * @param arrangementClipIndex - Arrangement clip index
 * @returns Clip LiveAPI object and handle
 */
export function registerArrangementClip(
  clipId: string,
  trackIndex: number,
  properties: Record<string, unknown>,
  arrangementClipIndex: number = 0,
): {
  clip: LiveAPI;
  clipHandle: MockObjectHandle;
} {
  const clipHandle = registerClipHandle(clipId, {
    path: `live_set tracks ${String(trackIndex)} arrangement_clips ${String(arrangementClipIndex)}`,
    properties,
  });

  return {
    clip: LiveAPI.from(`id ${clipId}`),
    clipHandle,
  };
}
