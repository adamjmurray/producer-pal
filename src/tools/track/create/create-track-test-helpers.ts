// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * Register the live_set the createTrack tests build on: two existing tracks,
 * two return tracks, and creators that name each new track after the index
 * they were called with.
 * @param createReturnTrack - What create_return_track returns
 * @returns The registered live_set mock
 */
export function registerCreateTrackLiveSet(
  createReturnTrack: (...args: unknown[]) => unknown,
): RegisteredMockObject {
  return registerMockObject("liveSet", {
    path: livePath.liveSet,
    properties: {
      tracks: children("existing1", "existing2"),
      return_tracks: children("returnA", "returnB"),
    },
    methods: {
      create_midi_track: (index: unknown) => [
        "id",
        `midi_track_${String(index)}`,
      ],
      create_audio_track: (index: unknown) => [
        "id",
        `audio_track_${String(index)}`,
      ],
      create_return_track: createReturnTrack,
    },
  });
}
