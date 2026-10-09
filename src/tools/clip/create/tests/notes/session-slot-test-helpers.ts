// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

export interface SessionSlot {
  clipSlot: RegisteredMockObject;
  clip: RegisteredMockObject;
}

/**
 * Two empty session clip slots on track 0, in a 4/4 Set.
 * @returns The slots for scenes 0 and 1, each with its clip
 */
export function twoSessionSlots(): [SessionSlot, SessionSlot] {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const slot = (sceneIndex: number): SessionSlot => ({
    clipSlot: registerMockObject(`clip-slot-0-${sceneIndex}`, {
      path: livePath.track(0).clipSlot(sceneIndex),
      properties: { has_clip: 0 },
    }),
    clip: registerMockObject(`clip-0-${sceneIndex}`, {
      path: livePath.track(0).clipSlot(sceneIndex).clip(),
      methods: createNoteTrackingMethods(),
    }),
  });

  return [slot(0), slot(1)];
}
