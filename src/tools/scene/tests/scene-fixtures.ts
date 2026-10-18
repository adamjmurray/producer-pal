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

/**
 * Registers a Live Set holding two scenes, and the app view.
 * @returns The Live Set mock
 */
export function registerTwoSceneSet(): RegisteredMockObject {
  registerMockObject("app-view", { path: livePath.view.app });

  return registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { scenes: children("existing1", "existing2") },
  });
}
