// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** Where the temp track a browser device loads onto lands. */
export const TEMP_TRACK = livePath.track(1);

interface TempTrackMocks {
  tempTrack: RegisteredMockObject;
  songView: RegisteredMockObject;
}

/**
 * Make `create_midi_track` add an empty temp track at t1, and register the
 * views a browser load selects through.
 * @param liveSet - The Live Set mock
 * @returns The temp track and the song view
 */
export function registerTempTrack(
  liveSet: RegisteredMockObject,
): TempTrackMocks {
  liveSet.methods.create_midi_track = vi.fn(() => ["id", "temp-track"]);

  const tempTrack = registerMockObject("temp-track", {
    path: TEMP_TRACK,
    type: "Track",
    properties: { devices: [] },
  });

  registerMockObject("selected-track", { path: livePath.view.selectedTrack });

  const songView = registerMockObject("song-view", {
    path: livePath.view.song,
  });

  return { tempTrack, songView };
}
