// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/**
 * Make a capture add a scene to the live_set's list, as Live does. A capture
 * that adds none is one Live ignored.
 * @param liveSet - The registered live_set mock
 * @returns The same mock
 */
export function captureAddsScene(
  liveSet: RegisteredMockObject,
): RegisteredMockObject {
  liveSet.methods.capture_and_insert_scene = () => {
    liveSet.properties.scenes = [
      ...(liveSet.get("scenes") as string[]),
      "id",
      "captured",
    ];

    return null;
  };

  return liveSet;
}

/**
 * Register the live_set, the selected scene, and the scene a capture inserts
 * right after it. A capture adds a scene to the live_set's list, as Live does.
 * @param selectedIndex - Index of the selected scene
 * @param tracks - The live_set's tracks child list
 * @param sceneCount - How many scenes already exist (default: enough to cover selectedIndex)
 * @returns The live_set and the newly inserted scene
 */
export function setupCaptureMocks(
  selectedIndex = 1,
  tracks: unknown[] = [],
  sceneCount = selectedIndex + 1,
): { liveSet: RegisteredMockObject; newScene: RegisteredMockObject } {
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      tracks,
      scenes: children(
        ...Array.from({ length: sceneCount }, (_, i) => `scene${i}`),
      ),
    },
  });

  captureAddsScene(liveSet);

  registerMockObject("live_set/view/selected_scene", {
    path: livePath.scene(selectedIndex),
  });

  const newScene = registerMockObject(
    `live_set/scenes/${String(selectedIndex + 1)}`,
    { path: livePath.scene(selectedIndex + 1) },
  );

  return { liveSet, newScene };
}
