// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
  type RegisteredMockObjectOptions,
} from "#src/test/mocks/mock-registry.ts";

const TRACK = livePath.track(0);

/**
 * Register an empty track whose insert lands "new-device" at d0.
 * @param device - Options for the inserted device
 * @returns The track mock
 */
export function registerInsertTrack(
  device: RegisteredMockObjectOptions = {},
): RegisteredMockObject {
  const track = registerMockObject("track-0", {
    path: TRACK,
    type: "Track",
    properties: { devices: [] },
    methods: { insert_device: () => ["id", "new-device"] },
  });

  registerMockObject("new-device", { path: TRACK.device(0), ...device });

  return track;
}
