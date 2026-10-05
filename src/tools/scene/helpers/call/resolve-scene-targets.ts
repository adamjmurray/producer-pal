// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { type IdLookup } from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import { targetObject } from "#src/tools/shared/validation/lists/named-targets.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { sceneIdAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type SceneCall } from "./parse-scene-call.ts";

/** What one target of an update-scene call carries into its write. */
export interface ScenePayload {
  scene: LiveAPI;
}

/**
 * Name the call's targets and resolve each now, before the first write. A path
 * that can't be parsed refuses the call; one that parses but names no scene
 * skips only its own target.
 * @param call - The update-scene call
 * @returns The targets in the order named, ids first
 * @throws Error when a path can't be parsed
 */
export function sceneTargets(call: SceneCall): Array<Target<ScenePayload>> {
  return call.named.map((named): Target<ScenePayload> => {
    if (named.param === "path") {
      // Quiet: the lookup below parses it again and says any legacy spelling.
      parseObjectPath(named.value, "path", true);
    }

    try {
      const scene = targetObject(named, "scene", sceneToUpdateAtPath);

      // Keyed by the scene itself, so an id and its path are one target.
      return { named, key: scene.id, data: { scene } };
    } catch (error) {
      return { named, skip: errorMessage(error) };
    }
  });
}

// --- Helpers below main export ---

/**
 * The scene a path names. A path past the last scene is a target, not a
 * destination — nothing here says what a new scene would be — so it is refused
 * with the tool that does make scenes.
 * @param entry - One scene path, as the caller wrote it
 * @returns The scene's id, or why there isn't one
 */
function sceneToUpdateAtPath(entry: string): IdLookup {
  const lookup = sceneIdAtPath(entry);

  if (lookup.id != null || !lookup.empty) {
    return lookup;
  }

  return { ...lookup, reason: `${lookup.reason}; ppal-create-scene makes one` };
}
