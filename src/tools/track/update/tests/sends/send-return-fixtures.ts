// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/**
 * Registers a live set with return tracks `return_A`, `return_B`, and so on.
 * @param names - Their names, in order
 */
export function registerReturnTracks(...names: string[]): void {
  const idOf = (index: number): string => `return_${"ABCDEFGH"[index]}`;

  registerMockObject("liveSet", {
    path: livePath.liveSet,
    properties: { return_tracks: children(...names.map((_, i) => idOf(i))) },
  });

  for (const [index, name] of names.entries()) {
    registerMockObject(idOf(index), {
      path: livePath.returnTrack(index),
      properties: { name },
    });
  }
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
