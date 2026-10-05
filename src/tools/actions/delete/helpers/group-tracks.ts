// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading what sits in a group track. A group's tracks follow it in the track
// list, so they are found by walking on from the group until one isn't inside.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { groupIdOf } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** One track inside a group track, as it was before the call. */
export interface InsideTrack {
  id: string;
  /** `t13 (id 124)` */
  label: string;
}

/**
 * Every track inside a group track, nested groups included, in track order.
 * @param group - A regular track
 * @returns What Live deletes along with the group
 */
export function tracksInside(group: LiveAPI): InsideTrack[] {
  const inside: InsideTrack[] = [];

  walkInside(group, (track) => {
    inside.push({ id: track.id, label: targetLabel(track) });

    return false;
  });

  return inside;
}

/**
 * The group a track is the only direct member of. Live won't delete such a
 * track by itself.
 * @param track - A regular track
 * @returns The group track, or null when the track is ungrouped or has a
 *   sibling
 */
export function onlyMemberOf(track: LiveAPI): LiveAPI | null {
  const groupId = groupIdOf(track);

  if (groupId === "0") {
    return null;
  }

  const group = LiveAPI.from(`id ${groupId}`);
  let members = 0;

  walkInside(group, (_track, parentId) => {
    members += parentId === groupId ? 1 : 0;

    // A second member is all it takes to answer.
    return members >= 2;
  });

  return members >= 2 ? null : group;
}

/**
 * Visit the tracks inside a group, in order, until one isn't or `visit` says
 * stop. Only reads the group of each track it visits, plus the one after the
 * last.
 * @param group - A regular track
 * @param visit - Called with each track and its direct group's id; returns true
 *   to stop
 */
function walkInside(
  group: LiveAPI,
  visit: (track: LiveAPI, parentId: string) => boolean,
): void {
  const groupIndex = group.trackIndex;

  if (groupIndex == null) {
    return;
  }

  const insideIds = new Set([group.id]);

  for (let index = groupIndex + 1; ; index++) {
    const track = LiveAPI.from(livePath.track(index));

    if (!track.exists()) {
      return;
    }

    const parentId = groupIdOf(track);

    if (!insideIds.has(parentId)) {
      return;
    }

    insideIds.add(track.id);

    if (visit(track, parentId)) {
      return;
    }
  }
}
