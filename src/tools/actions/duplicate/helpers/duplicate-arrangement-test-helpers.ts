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

/**
 * Register a track whose arrangement duplicate behaves like Live's: the copy
 * lands at the beat it was handed and clears every copy already overlapping the
 * span it fills. A cleared clip keeps its id and loses its path, which is what
 * a fresh lookup of a dead clip reads (dev/LiveAPI-Object-Reuse.md) — so a test
 * built on this catches code that trusts the id or `exists()`.
 *
 * Registers each copy itself, unlike `registerTrackWithArrangementDup`, because
 * where a copy landed is the whole point here. Every copy is `copyBeats` long,
 * which is true whenever the sources are the same length.
 * @param trackIndex - Track index
 * @param properties - Optional additional track properties
 * @param copyBeats - How far each copy reaches from its start
 * @returns The registered track mock
 */
export function registerTrackThatClearsOnDup(
  trackIndex: number,
  properties?: Record<string, unknown>,
  copyBeats = 4,
): RegisteredMockObject {
  const placed: { start: number; mock: RegisteredMockObject }[] = [];
  let clipCounter = 0;

  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties,
    methods: {
      duplicate_clip_to_arrangement: (_sourceId: unknown, beats: unknown) => {
        const start = Number(beats);

        for (const earlier of placed) {
          if (
            earlier.start < start + copyBeats &&
            earlier.start + copyBeats > start
          ) {
            registerMockObject(earlier.mock.id, { path: "" });
          }
        }

        const clip = registerArrangementClip(trackIndex, clipCounter++, start);

        placed.push({ start, mock: clip });

        return ["id", clip.id];
      },
    },
  });
}
