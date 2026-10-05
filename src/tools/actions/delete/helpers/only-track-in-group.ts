// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live silently ignores a delete of the only track in a group track. Catch it
// first and point at the group to delete instead, which takes the track along.

import { groupsHostTrack } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { onlyMemberOf } from "./group-tracks.ts";

const WONT_DELETE = "Live won't delete the only track in a group track";

/**
 * Why a track can't be deleted because it is alone in its group track, or null
 * when it isn't. The reason names the nearest group track that can be deleted.
 * @param track - A regular track
 * @param hostTrackIndex - The Producer Pal host track's index, if known
 * @returns The reason, or null when Live will delete the track
 */
export function onlyTrackInGroupRefusal(
  track: LiveAPI,
  hostTrackIndex: number | null,
): string | null {
  const parent = onlyMemberOf(track);

  if (parent == null) {
    return null;
  }

  // A group that is itself alone in its group can't be deleted either, so go up
  // to the first one that can.
  let group = parent;
  let walkedUp = false;

  for (;;) {
    if (holdsHost(group, hostTrackIndex)) {
      return `${WONT_DELETE}, and group track ${targetLabel(group)} can't be deleted because it holds the Producer Pal device`;
    }

    const up = onlyMemberOf(group);

    if (up == null) {
      break;
    }

    group = up;
    walkedUp = true;
  }

  // Deleting the track's own group takes just those two, unless the track is a
  // group too.
  const takes =
    !walkedUp && !((track.getProperty("is_foldable") as number) > 0)
      ? "both"
      : "the tracks inside it too";

  return `${WONT_DELETE}; delete group track ${targetLabel(group)} instead, which deletes ${takes}`;
}

/**
 * Whether deleting a group would take the Producer Pal device with it.
 * @param group - The group track
 * @param hostTrackIndex - The host track's index, if known
 * @returns true when the group is the host track or holds it
 */
function holdsHost(group: LiveAPI, hostTrackIndex: number | null): boolean {
  return (
    (hostTrackIndex != null && group.trackIndex === hostTrackIndex) ||
    groupsHostTrack(group, hostTrackIndex)
  );
}
