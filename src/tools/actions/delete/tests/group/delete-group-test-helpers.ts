// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  deleteMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";

/** One track of a test Live Set, in track order. */
export interface GroupTrack {
  /** Its id, and what the tests call it */
  id: string;
  /** The group it sits directly in */
  group?: string;
  /** Whether it is a group track */
  foldable?: boolean;
}

interface GroupSetOptions {
  /** Runs when Live is asked to delete a track, before it acts */
  onDelete?: (index: number) => void;
  /** Runs once Live has deleted the track and what was inside it */
  afterDelete?: (index: number) => void;
  /** The index of the track hosting the Producer Pal device */
  host?: number;
}

/**
 * Register tracks `t0`..., where `delete_track` does what Live does: it takes a
 * group and everything inside it, and it ignores the only track in a group.
 * @param layout - The tracks, in track order
 * @param options - Hooks around each delete, and where the device is
 * @returns The Live Set
 */
export function setUpGroupSet(
  layout: GroupTrack[],
  options: GroupSetOptions = {},
): RegisteredMockObject {
  const { onDelete, afterDelete, host } = options;
  const tracks = [...layout];

  simulateMockDeletes();
  mockNonExistentObjects();

  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...layout.map(({ id }) => id)) },
    methods: {
      delete_track: (index: unknown) => {
        const at = Number(index);

        onDelete?.(at);

        if (!isOnlyMember(tracks, at)) {
          removeWithMembers(tracks, at);
          afterDelete?.(at);
        }

        return null;
      },
    },
  });

  for (const [index, { id, group, foldable }] of layout.entries()) {
    registerMockObject(id, {
      path: livePath.track(index),
      type: "Track",
      properties: {
        group_track: ["id", group ?? 0],
        is_foldable: foldable === true ? 1 : 0,
      },
    });
  }

  if (host != null) {
    registerMockObject("this_device", {
      path: livePath.track(host).device(0),
    });
  }

  return liveSet;
}

/**
 * Delete a track and every track inside it, from the list and the registry.
 * @param tracks - The tracks as they are now; this takes the deleted ones out
 * @param at - The track's index
 */
function removeWithMembers(tracks: GroupTrack[], at: number): void {
  const taken = takenWith(tracks, at);

  for (let i = 0; i <= taken; i++) {
    deleteMockObject(`live_set tracks ${at}`);
  }

  tracks.splice(at, taken + 1);
}

/**
 * How many tracks follow one that go with it: those inside it, at any depth.
 * @param tracks - The tracks as they are now
 * @param at - The track's index
 * @returns The count
 */
function takenWith(tracks: GroupTrack[], at: number): number {
  const inside = new Set([tracks[at]?.id]);
  let count = 0;

  for (let i = at + 1; i < tracks.length; i++) {
    if (!inside.has(tracks[i]?.group)) {
      break;
    }

    inside.add(tracks[i]?.id);
    count++;
  }

  return count;
}

/**
 * Whether Live refuses to delete the track: it is the only direct member of its
 * group. Live does the same for a member that is a group itself.
 * @param tracks - The tracks as they are now
 * @param at - The track's index
 * @returns true when Live ignores the delete
 */
function isOnlyMember(tracks: GroupTrack[], at: number): boolean {
  const group = tracks[at]?.group;

  return (
    group != null &&
    tracks.filter((track) => track.group === group).length === 1
  );
}
