// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What deleting group tracks takes with it, worked out before the first delete.
// Live deletes a group together with every track inside it, and each delete
// shifts the indexes after it, so afterwards there is no telling what was where.

import {
  alsoDoneInsideDetail,
  isGroupTrack,
  tracksInside,
} from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { listTrackClips } from "#src/tools/shared/clip/slot-contents/track-clips-listing.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { clipsListed } from "./also-deleted-clips.ts";
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
  /**
   * The clips on those tracks, as each group's detail says them, by index. A
   * named track says its own clips, so they aren't counted here. No entry for
   * a group whose unnamed tracks hold none.
   */
  insideClips: ReadonlyMap<number, string>;
}

/** A track inside a group, with the object to read its clips from. Never kept
 * past the check that made it. */
interface Member extends InsideTrack {
  object: LiveAPI;
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
  const insideClips = new Map<number, string>();

  if (type !== "track") {
    return { covered, unnamedInside, insideClips };
  }

  const tracks = targets.flatMap((target, index) =>
    target.data?.kind === "delete" && target.data.object.category === "regular"
      ? [{ index, object: target.data.object }]
      : [],
  );
  const groups = tracks.filter(({ object }) => isGroupTrack(object));
  const named = new Set(tracks.map(({ object }) => object.id));
  // A group named twice is walked once, and its clips read once.
  const insideById = new Map<string, Member[]>();
  const clipsById = new Map<string, string | undefined>();

  for (const group of groups) {
    const { id } = group.object;
    const inside = insideById.get(id) ?? insideTracks(group.object);
    const insideIds = new Set(inside.map((track) => track.id));
    const unnamed = inside.filter((track) => !named.has(track.id));

    if (!insideById.has(id)) {
      clipsById.set(id, clipsOn(unnamed));
    }

    insideById.set(id, inside);
    unnamedInside.set(
      group.index,
      unnamed.map(({ id: trackId, label }) => ({ id: trackId, label })),
    );

    const clips = clipsById.get(id);

    if (clips != null) {
      insideClips.set(group.index, clips);
    }

    for (const { index, object } of tracks) {
      if (insideIds.has(object.id)) {
        covered.add(index);
      }
    }
  }

  return { covered, unnamedInside, insideClips };
}

/**
 * What a group's delete says about the tracks that went with it, and the clips
 * on them.
 * @param inside - The tracks the call didn't name that were inside the group
 * @param clips - What {@link GroupDeletes.insideClips} holds for the group
 * @returns The detail, or undefined when nothing else went with it
 */
export function alsoDeletedDetail(
  inside: InsideTrack[],
  clips?: string,
): string | undefined {
  const tracks = alsoDoneInsideDetail(
    "deleted",
    inside.map((track) => track.label),
  );

  return tracks == null || clips == null ? tracks : `${tracks}; and ${clips}`;
}

// What Live deletes along with a group: every track inside it.
function insideTracks(group: LiveAPI): Member[] {
  return tracksInside(group).map((track) => ({
    id: track.id,
    label: targetLabel(track),
    object: track,
  }));
}

// The clips on a group's tracks, in track order. A group inside holds none of
// its own: its slots only fire the tracks inside it.
function clipsOn(tracks: Member[]): string | undefined {
  return clipsListed(
    tracks.flatMap(({ object }) =>
      isGroupTrack(object) ? [] : listTrackClips(object),
    ),
    tracks.length === 1 ? "on it" : "on them",
  );
}
