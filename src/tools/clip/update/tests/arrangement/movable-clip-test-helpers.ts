// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** The id of the clip {@link registerMovableClip} makes. */
export const MOVABLE_CLIP_ID = "123";

/**
 * Registers an 8-beat MIDI arrangement clip, ready to be moved, with its
 * track and a 4/4 song. Everything else is non-existent, so a destination has
 * to be registered by the test.
 * @param trackIndex - The track the clip sits on
 */
export function registerMovableClip(trackIndex: number): void {
  const length = 8;

  mockNonExistentObjects();
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerMockObject(MOVABLE_CLIP_ID, {
    path: livePath.track(trackIndex).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: length,
      end_time: length * 2,
      length,
      start_marker: 0,
      end_marker: length,
      loop_start: 0,
      loop_end: length,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });
  registerMockObject(`movable_track_${trackIndex}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: { arrangement_clips: children(MOVABLE_CLIP_ID) },
  });
}
