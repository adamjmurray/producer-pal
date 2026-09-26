// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";

/**
 * Get the track index of the host device
 * @returns Track index or null if not found
 */
export function getHostTrackIndex(): number | null {
  try {
    const device = LiveAPI.from("this_device");

    return device.trackIndex;
  } catch {
    return null;
  }
}

/**
 * Whether a track is a group holding the host track, at any depth. Deleting a
 * group deletes its members, so it would take the device with it.
 * @param track - The track to check
 * @param hostTrackIndex - The host track's index, from getHostTrackIndex()
 * @returns true when the host track sits somewhere inside it
 */
export function groupsHostTrack(
  track: LiveAPI,
  hostTrackIndex: number | null,
): boolean {
  if (hostTrackIndex == null) {
    return false;
  }

  let groupId = groupIdOf(livePath.track(hostTrackIndex));

  while (groupId !== "0") {
    if (groupId === track.id) {
      return true;
    }

    groupId = groupIdOf(`id ${groupId}`);
  }

  return false;
}

/**
 * The group a track sits in
 * @param path - The track's path or id
 * @returns The group's id, or "0" when it isn't grouped
 */
function groupIdOf(path: Parameters<typeof LiveAPI.from>[0]): string {
  const groupId = LiveAPI.from(path).getPropertyList("group_track")[1] as
    | number
    | undefined;

  return String(groupId ?? 0);
}
