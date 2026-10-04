// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/**
 * Registers a live set with two return tracks: A-Reverb and B-Delay.
 */
export function registerReturnTracks(): void {
  registerMockObject("liveSet", {
    path: livePath.liveSet,
    properties: { return_tracks: children("return_A", "return_B") },
  });
  registerMockObject("return_A", {
    path: livePath.returnTrack(0),
    properties: { name: "A-Reverb" },
  });
  registerMockObject("return_B", {
    path: livePath.returnTrack(1),
    properties: { name: "B-Delay" },
  });
}

/**
 * Registers tracks `123` and `456` (t0, t1), each with a mixer holding sends.
 * @param first - Ids of the first track's sends
 * @param second - Ids of the second track's sends
 */
export function registerTwoTracksWithSends(
  first: string[],
  second: string[],
): void {
  registerMockObject("123", { path: livePath.track(0) });
  registerMockObject("456", { path: livePath.track(1) });
  registerMockObject("mixer_1", {
    path: livePath.track(0).mixerDevice(),
    properties: { sends: children(...first) },
  });
  registerMockObject("mixer_2", {
    path: livePath.track(1).mixerDevice(),
    properties: { sends: children(...second) },
  });
}
