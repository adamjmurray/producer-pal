// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading what sits in a group track. A group's tracks follow it in the track
// list, so they are found by walking on from the group until one isn't inside.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { groupIdOf } from "#src/tools/shared/arrangement/tracks/get-host-track-index.ts";

/**
 * Whether a track is a group track.
 * @param track - A regular track
 * @returns True for a group
 */
export function isGroupTrack(track: LiveAPI): boolean {
  return (track.getProperty("is_foldable") as number) > 0;
}

/**
 * Every track inside a group track, nested groups included, in track order.
 * The tracks are only good for the request that read them.
 * @param group - A regular track
 * @returns The group's members, at every depth
 */
export function tracksInside(group: LiveAPI): LiveAPI[] {
  const inside: LiveAPI[] = [];

  walkInside(group, (track) => {
    inside.push(track);

    return false;
  });

  return inside;
}

/**
 * What a group track's entry says about the tracks Live took along with it.
 * @param verb - What was done to them: "copied" or "deleted"
 * @param labels - The tracks inside, as `t12 (id 47)`
 * @returns The detail, or undefined when nothing was inside
 */
export function alsoDoneInsideDetail(
  verb: "copied" | "deleted",
  labels: string[],
): string | undefined {
  if (labels.length === 0) {
    return undefined;
  }

  const list = labels.join(", ");

  return labels.length === 1
    ? `also ${verb} the track inside this group track: ${list}`
    : `also ${verb} the ${labels.length} tracks inside this group track: ${list}`;
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
