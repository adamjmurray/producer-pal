// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** Why a slot on the group track `registerGroupBesideTrack()` makes has no clip. */
export const GROUP_REASON =
  "track t0 (id group) is a group track; it holds no clips";

/**
 * Register a group track (id `group`) at t0 and an ordinary track (id `midi`)
 * at t1. Every other path does not exist.
 */
export function registerGroupBesideTrack(): void {
  registerMockObject("group", {
    path: livePath.track(0),
    type: "Track",
    properties: { is_foldable: 1 },
  });
  registerMockObject("midi", {
    path: livePath.track(1),
    type: "Track",
    properties: { is_foldable: 0 },
  });
  mockNonExistentObjects();
}
