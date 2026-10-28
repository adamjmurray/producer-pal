// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/**
 * Registers a clip slot t0/s0 holding a clip, and an empty slot t1/s2 on a MIDI
 * track, where the moved clip lands as "t1/s2/clip".
 */
export function registerMoveToEmptySlot(): void {
  registerMockObject("track-1", {
    path: livePath.track(1),
    properties: { has_midi_input: 1, is_frozen: 0 },
  });
  registerMockObject("t0/s0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 1 },
  });
  registerMockObject("t1/s2", {
    path: livePath.track(1).clipSlot(2),
    properties: { has_clip: 0 },
  });
  registerMockObject("t1/s2/clip", {
    path: livePath.track(1).clipSlot(2).clip(),
  });
}
