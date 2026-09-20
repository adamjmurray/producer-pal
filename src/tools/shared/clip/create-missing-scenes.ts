// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";

/**
 * Creates the scenes a clip destination past the last one needs. A slot path
 * says on its own what to make, so every tool that writes into one makes them
 * the same way and reports the same thing.
 * @param sceneIndex - The scene the destination names (0-based)
 * @param liveSet - The Live Set, when the caller already has it
 * @returns The scenes created ("s8", or "s8-s9" for a run), or null when the
 * scene was already there
 * @throws Error when the scene is past the auto-create cap
 */
export function createMissingScenes(
  sceneIndex: number,
  liveSet: LiveAPI = LiveAPI.from(livePath.liveSet),
): string | null {
  if (sceneIndex >= MAX_AUTO_CREATED_SCENES) {
    throw new Error(
      `scene "s${sceneIndex}" is out of range: scenes auto-create only through "s${MAX_AUTO_CREATED_SCENES - 1}"`,
    );
  }

  const sceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex < sceneCount) {
    return null;
  }

  for (let index = sceneCount; index <= sceneIndex; index++) {
    liveSet.call("create_scene", -1);
  }

  return sceneCount === sceneIndex
    ? `s${sceneCount}`
    : `s${sceneCount}-s${sceneIndex}`;
}
