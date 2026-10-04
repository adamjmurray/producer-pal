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
