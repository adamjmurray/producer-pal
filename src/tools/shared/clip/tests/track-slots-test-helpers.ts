// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * A Live Set whose track 0 has one slot per entry, holding a clip or not.
 * @param hasClips - has_clip for each of track 0's slots
 * @returns The Live Set
 */
export function registerTrackSlots(hasClips: number[]): RegisteredMockObject {
  const ids = hasClips.map((_, i) => `slot${i}`);

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { clip_slots: children(...ids) },
  });

  for (const [sceneIndex, hasClip] of hasClips.entries()) {
    registerMockObject(ids[sceneIndex] as string, {
      path: livePath.track(0).clipSlot(sceneIndex),
      properties: { has_clip: hasClip },
    });
  }

  return registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { scenes: children(...ids) },
  });
}
