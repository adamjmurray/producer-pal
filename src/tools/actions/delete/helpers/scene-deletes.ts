// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What deleting a scene takes with it: every clip in its slots, return tracks
// included. Read before the first delete, since each delete shifts the scene
// indexes after it and the clip's id and path are gone afterwards.

import { sceneClips } from "#src/tools/shared/clip/slot-contents/scene-slot-clips.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type DeletePayload } from "./delete-targets.ts";

/**
 * What each named scene's delete says about the clips that go with it, by the
 * target's index.
 * @param type - Type of objects to delete
 * @param targets - The call's targets, in the order named
 * @returns Nothing for a call that doesn't delete scenes; no entry for a scene
 *   with no clips
 */
export function sceneDeletes(
  type: string,
  targets: Array<Target<DeletePayload>>,
): ReadonlyMap<number, string> {
  const details = new Map<number, string>();

  if (type !== "scene") {
    return details;
  }

  for (const [index, target] of targets.entries()) {
    if (target.data?.kind !== "delete") {
      continue;
    }

    const { sceneIndex } = target.data.object;

    if (sceneIndex != null) {
      const detail = alsoDeletedClips(listClips(sceneIndex));

      if (detail != null) {
        details.set(index, detail);
      }
    }
  }

  return details;
}

// --- Helpers below main export ---

/**
 * Each clip in a scene, as the path it had and its name.
 * @param sceneIndex - The scene's index
 * @returns `t0/s1 "Bass"`, or just the path for a clip with no name
 */
function listClips(sceneIndex: number): string[] {
  return sceneClips(sceneIndex).map(({ clip, path }) => {
    const name = clip.getProperty("name");

    return typeof name === "string" && name !== ""
      ? `${path} ${JSON.stringify(name)}`
      : path;
  });
}

/**
 * What a scene's entry says about its clips.
 * @param clips - The clips, as listed
 * @returns The detail, or undefined for a scene with none
 */
function alsoDeletedClips(clips: string[]): string | undefined {
  if (clips.length === 0) {
    return undefined;
  }

  return clips.length === 1
    ? `also deleted the clip in this scene: ${clips[0]}`
    : `also deleted the ${clips.length} clips in this scene: ${clips.join(", ")}`;
}
