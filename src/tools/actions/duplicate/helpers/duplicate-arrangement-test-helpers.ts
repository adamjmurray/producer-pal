// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * Register an arrangement clip mock with standard properties.
 * @param trackIndex - Track index
 * @param clipIndex - Arrangement clip index
 * @param startTime - Clip start time in beats
 * @returns Registered mock object
 */
export function registerArrangementClip(
  trackIndex: number,
  clipIndex: number,
  startTime: number,
): RegisteredMockObject {
  return registerMockObject(
    livePath.track(trackIndex).arrangementClip(clipIndex),
    {
      path: livePath.track(trackIndex).arrangementClip(clipIndex),
      properties: { is_arrangement_clip: 1, start_time: startTime },
    },
  );
}

/**
 * Register a track mock with a `duplicate_clip_to_arrangement` method that
 * returns arrangement clip IDs from a counter.
 * @param trackIndex - Track index
 * @param properties - Optional additional track properties
 * @returns Object with the registered track mock and a counter reset function
 */
export function registerTrackWithArrangementDup(
  trackIndex: number,
  properties?: Record<string, unknown>,
): RegisteredMockObject {
  let clipCounter = 0;

  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties,
    methods: {
      duplicate_clip_to_arrangement: () => {
        const clipId = livePath.track(trackIndex).arrangementClip(clipCounter);

        clipCounter++;

        return ["id", clipId];
      },
    },
  });
}

/**
 * The standard session-to-arrangement fixture: a session clip on track 0, a
 * track 0 that answers `duplicate_clip_to_arrangement`, and one arrangement
 * clip already sitting on it.
 * @param clipProperties - Optional properties for the source session clip
 * @returns The registered track 0 mock
 */
export function registerSessionClipForArrangementDup(
  clipProperties?: Record<string, unknown>,
): RegisteredMockObject {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: clipProperties,
  });

  const track0 = registerTrackWithArrangementDup(0);

  registerArrangementClip(0, 0, 8);

  return track0;
}
