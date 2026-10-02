// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * Registers the first three scenes, with ids "123", "456" and "789".
 * @returns The three scene mocks, in order
 */
export function registerThreeScenes(): [
  RegisteredMockObject,
  RegisteredMockObject,
  RegisteredMockObject,
] {
  return [
    registerMockObject("123", { path: livePath.scene(0) }),
    registerMockObject("456", { path: livePath.scene(1) }),
    registerMockObject("789", { path: livePath.scene(2) }),
  ];
}
