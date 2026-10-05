// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Deleting a track, where the Live call depends on which kind of track it is.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  getHostTrackIndex,
  groupsHostTrack,
} from "#src/tools/shared/arrangement/tracks/get-host-track-index.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { onlyTrackInGroupRefusal } from "./only-track-in-group.ts";

/**
 * Deletes a track by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @param confirmDeleted - Checks the object is actually gone afterwards
 * @param landed - Says that Live deleted the track although the call threw
 * @returns null if the track is gone, else why it wasn't deleted
 */
export function deleteTrackObject(
  id: string,
  object: LiveAPI,
  confirmDeleted: (type: string, id: string) => string | null,
  landed: (phrase: string) => void,
): string | null {
  // The main track is always there; Live has no call to remove it. Say that,
  // rather than falling through to the "no track index" message below, which
  // reads like something went wrong inside us.
  if (object.path === String(livePath.masterTrack())) {
    return `Live has no way to delete the main track ${targetLabel(object)}`;
  }

  // Check for return track first
  const returnMatch = object.path.match(/live_set return_tracks (\d+)/);

  if (returnMatch) {
    callDelete("delete_return_track", Number(returnMatch[1]), id, landed);

    return confirmDeleted("track", id);
  }

  // Regular track
  const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);

  if (Number.isNaN(trackIndex)) {
    return `no track index for ${targetLabel(object)}`;
  }

  const hostTrackIndex = getHostTrackIndex();

  if (trackIndex === hostTrackIndex) {
    return `cannot delete track ${targetLabel(object)}, which hosts the Producer Pal device`;
  }

  if (groupsHostTrack(object, hostTrackIndex)) {
    return `cannot delete group track ${targetLabel(object)}, which contains the Producer Pal device`;
  }

  const onlyInGroup = onlyTrackInGroupRefusal(object, hostTrackIndex);

  if (onlyInGroup != null) {
    return onlyInGroup;
  }

  callDelete("delete_track", trackIndex, id, landed);

  return confirmDeleted("track", id);
}

/**
 * Ask Live to delete a track. A throw can still mean Live did it, so look
 * before reporting a failure.
 * @param method - The Live Set's delete method
 * @param index - The track's index
 * @param id - The track's ID
 * @param landed - Says the track is gone
 * @throws Error whatever Live threw
 */
function callDelete(
  method: "delete_track" | "delete_return_track",
  index: number,
  id: string,
  landed: (phrase: string) => void,
): void {
  try {
    LiveAPI.from(livePath.liveSet).call(method, index);
  } catch (error) {
    if (!LiveAPI.from(id).exists()) {
      landed("deleted the track");
    }

    throw error;
  }
}
