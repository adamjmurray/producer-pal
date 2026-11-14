// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What deleting a scene or a track takes with it: the clips it holds. A scene
// holds one per track, return tracks included; a track holds its session,
// arrangement and take-lane clips. Read before the first delete, since each
// delete shifts the indexes after it and the clip's id and path are gone
// afterwards.

import { sceneClips } from "#src/tools/shared/clip/slot-contents/scene-slot-clips.ts";
import {
  type ListedClip,
  listTrackClips,
} from "#src/tools/shared/clip/slot-contents/track-clips-listing.ts";
import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { alsoDeletedClips } from "./also-deleted-clips.ts";
import { type DeletePayload } from "./delete-targets.ts";

/**
 * What each named scene's or track's delete says about the clips that go with
 * it, by the target's index.
 * @param type - Type of objects to delete
 * @param targets - The call's targets, in the order named
 * @returns Nothing for a call that deletes neither; no entry for a scene or
 *   track with no clips, or for a group track, which holds none of its own
 *   (its detail names the clips on the tracks inside it)
 */
export function clipDeletes(
  type: string,
  targets: Array<Target<DeletePayload>>,
): ReadonlyMap<number, string> {
  const details = new Map<number, string>();

  if (type !== "scene" && type !== "track") {
    return details;
  }

  // A track named twice is read once.
  const trackReads = new Map<string, string | undefined>();

  for (const [index, target] of targets.entries()) {
    if (target.data?.kind !== "delete") {
      continue;
    }

    const { object, id } = target.data;
    let detail: string | undefined;

    if (type === "scene") {
      detail =
        object.sceneIndex == null
          ? undefined
          : alsoDeletedClips(listScene(object.sceneIndex), "scene");
    } else if (trackReads.has(id)) {
      detail = trackReads.get(id);
    } else {
      detail = trackDetail(object);
      trackReads.set(id, detail);
    }

    if (detail != null) {
      details.set(index, detail);
    }
  }

  return details;
}

// --- Helpers below main export ---

function listScene(sceneIndex: number): ListedClip[] {
  return sceneClips(sceneIndex).map(({ clip, path }) => ({ path, clip }));
}

// A group track's slots only fire the tracks inside it. The tracks inside, and
// the clips on them, are said in the group's own detail (group-deletes.ts).
function trackDetail(track: LiveAPI): string | undefined {
  return isGroupTrack(track)
    ? undefined
    : alsoDeletedClips(listTrackClips(track), "track");
}
