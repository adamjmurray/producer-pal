// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Deleting a track, where the Live call depends on which kind of track it is.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Deletes a track by its index
 * @param id - The object ID
 * @param object - The object to delete
 * @param confirmDeleted - Checks the object is actually gone afterwards
 * @returns true if the track is gone, false if skipped or Live refused
 */
export function deleteTrackObject(
  id: string,
  object: LiveAPI,
  confirmDeleted: (type: string, id: string) => boolean,
): boolean {
  // The main track is always there; Live has no call to remove it. Say that,
  // rather than falling through to the "no track index" message below, which
  // reads like something went wrong inside us.
  if (object.path === String(livePath.masterTrack())) {
    console.warn("delete: Live has no way to delete the main track, skipping");

    return false;
  }

  // Check for return track first
  const returnMatch = object.path.match(/live_set return_tracks (\d+)/);

  if (returnMatch) {
    const returnTrackIndex = Number(returnMatch[1]);
    const liveSet = LiveAPI.from(livePath.liveSet);

    liveSet.call("delete_return_track", returnTrackIndex);

    return confirmDeleted("track", id);
  }

  // Regular track
  const trackIndex = Number(object.path.match(/live_set tracks (\d+)/)?.[1]);

  if (Number.isNaN(trackIndex)) {
    console.warn(
      `delete: no track index for ${targetLabel(object)} (Live path "${object.path}"), skipping`,
    );

    return false;
  }

  const hostTrackIndex = getHostTrackIndex();

  if (trackIndex === hostTrackIndex) {
    console.warn(
      "delete: cannot delete track hosting the Producer Pal device, skipping",
    );

    return false;
  }

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("delete_track", trackIndex);

  return confirmDeleted("track", id);
}
