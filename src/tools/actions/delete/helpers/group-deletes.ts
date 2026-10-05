// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What deleting group tracks takes with it, worked out before the first delete.
// Live deletes a group together with every track inside it, and each delete
// shifts the indexes after it, so afterwards there is no telling what was where.

import {
  isGroupTrack,
  tracksInside,
} from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type DeletePayload } from "./delete-targets.ts";

/** One track inside a group track, as it was before the call. */
export interface InsideTrack {
  id: string;
  /** `t13 (id 124)` */
  label: string;
}

/** How the group tracks in a call relate to the tracks named with them. */
export interface GroupDeletes {
  /**
   * Targets inside another group the call also names, by index. The group's
   * delete takes them; they get no delete of their own unless it fails.
   */
  covered: ReadonlySet<number>;
  /**
   * Each group target's tracks that the call didn't name, by index: what goes
   * with it unasked. Holds every group target, even when it is empty.
   */
  unnamedInside: ReadonlyMap<number, InsideTrack[]>;
}

/**
 * Work out which named tracks are groups, what is inside each, and which named
 * tracks are inside another named group.
 * @param type - Type of objects to delete
 * @param targets - The call's targets, in the order named
 * @returns Nothing for a call that names no group track
 */
export function groupDeletes(
  type: string,
  targets: Array<Target<DeletePayload>>,
): GroupDeletes {
  const covered = new Set<number>();
  const unnamedInside = new Map<number, InsideTrack[]>();

  if (type !== "track") {
    return { covered, unnamedInside };
  }

  const tracks = targets.flatMap((target, index) =>
    target.data?.kind === "delete" && target.data.object.category === "regular"
      ? [{ index, object: target.data.object }]
      : [],
  );
  const groups = tracks.filter(({ object }) => isGroupTrack(object));
  const named = new Set(tracks.map(({ object }) => object.id));
  // A group named twice is walked once.
  const insideById = new Map<string, InsideTrack[]>();

  for (const group of groups) {
    const { id } = group.object;
    const inside = insideById.get(id) ?? insideTracks(group.object);
    const insideIds = new Set(inside.map((track) => track.id));

    insideById.set(id, inside);
    unnamedInside.set(
      group.index,
      inside.filter((track) => !named.has(track.id)),
    );

    for (const { index, object } of tracks) {
      if (insideIds.has(object.id)) {
        covered.add(index);
      }
    }
  }

  return { covered, unnamedInside };
}

/**
 * What a group's delete says about the tracks that went with it.
 * @param inside - The tracks the call didn't name that were inside the group
 * @returns The detail, or undefined when nothing else went with it
 */
export function alsoDeletedDetail(inside: InsideTrack[]): string | undefined {
  const labels = inside.map((track) => track.label).join(", ");

  if (inside.length === 0) {
    return undefined;
  }

  return inside.length === 1
    ? `also deleted the track inside this group track: ${labels}`
    : `also deleted the ${inside.length} tracks inside this group track: ${labels}`;
}

// What Live deletes along with a group: every track inside it.
function insideTracks(group: LiveAPI): InsideTrack[] {
  return tracksInside(group).map((track) => ({
    id: track.id,
    label: targetLabel(track),
  }));
}
