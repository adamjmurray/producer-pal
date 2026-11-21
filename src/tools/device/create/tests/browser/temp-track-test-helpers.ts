// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { mockWorkingDeviceMoves } from "#src/tools/device/update/tests/update-device-test-helpers.ts";

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

/**
 * Register the Live Set and a t0 holding one device, where a browser device
 * is created.
 * @returns The Live Set and track mocks
 */
export function registerTargetTrack(): {
  liveSet: RegisteredMockObject;
  track: RegisteredMockObject;
} {
  const liveSet = mockWorkingDeviceMoves();

  liveSet.methods.delete_track = vi.fn();

  const track = registerMockObject("track-0", {
    path: livePath.track(0),
    type: "Track",
    properties: { devices: children("existing") },
  });

  registerMockObject("existing", { path: livePath.track(0).device(0) });

  return { liveSet, track };
}
