// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * The clip id for a track. Not "0": Live reads id 0 as no object at all.
 * @param trackIndex - The track the clip sits on
 * @returns The clip id
 */
export function clipId(trackIndex: number): string {
  return `10${trackIndex}`;
}

/**
 * One 4-bar arrangement MIDI clip on its own track, so a move can't collide
 * with a sibling.
 * @param trackIndex - The track it sits on
 * @returns The track mock, which records the move calls
 */
export function setupClipOnTrack(trackIndex: number): RegisteredMockObject {
  registerMockObject(clipId(trackIndex), {
    path: livePath.track(trackIndex).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0,
      end_time: 16,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    },
  });

  return registerMockObject(`track-${trackIndex}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: { track_index: trackIndex },
    methods: {
      duplicate_clip_to_arrangement: () => `id moved-${trackIndex}`,
      create_midi_clip: () => `id temp-${trackIndex}`,
      delete_clip: () => null,
    },
  });
}
