// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** The Live Set {@link registerTrackCopySet} builds, and its tracks. */
export interface TrackCopySet {
  liveSet: RegisteredMockObject;
  /** Every track so far, copies included, by id */
  tracks: Map<string, RegisteredMockObject>;
}

/**
 * Register tracks whose duplicate_track behaves the way Live's does: the copy
 * lands right after its source, and a group's copy takes the members along and
 * lands after the last of them. Optionally one track is a group with its
 * members right after it. Copy N is `copy-N`, and its members `copy-N-m1`, `copy-N-m2`…
 * @param ids - Track ids, in Set order
 * @param group - Which track is a group, and how many members follow it;
 *   none when omitted. Group tracks and their members get `is_foldable` and
 *   `group_track`.
 * @param group.index - The group's index
 * @param group.members - How many tracks after it are its members, at any depth
 * @param group.inner - A group inside it: the member that is one (1 is the
 *   first member), and how many of the tracks after it are inside that one
 * @param failing - Which duplicate_track calls make no copy, counting from 1
 * @returns The Live Set and its tracks
 */
export function registerTrackCopySet(
  ids: string[],
  group?: {
    index: number;
    members: number;
    inner?: { offset: number; members: number };
  },
  failing: number[] = [],
): TrackCopySet {
  const order = [...ids];
  const tracks = new Map<string, RegisteredMockObject>();
  let copies = 0;
  let calls = 0;
  const groupCopies = new Set<number>();

  // The track's place in the group (0 is the group itself), if it is in it.
  const placeInGroup = (id: string): number | undefined => {
    const at = ids.indexOf(id);
    const copy = /^copy-(\d+)(?:-m(\d+))?$/.exec(id);

    if (group == null) {
      return undefined;
    }

    if (at >= 0) {
      const rel = at - group.index;

      return rel >= 0 && rel <= group.members ? rel : undefined;
    }

    return copy != null && groupCopies.has(Number(copy[1]))
      ? Number(copy[2] ?? 0)
      : undefined;
  };

  // What each track in the group says about its group, as Live does.
  const groupProps = (id: string): Record<string, unknown> => {
    const rel = placeInGroup(id);
    const inner = group?.inner;

    if (group == null || rel == null) {
      return {};
    }

    const insideInner =
      inner != null &&
      rel > inner.offset &&
      rel <= inner.offset + inner.members;
    const parentRel = insideInner ? inner.offset : 0;

    const nameOf = (r: number): string => {
      const copy = /^copy-(\d+)/.exec(id);

      if (copy == null) {
        return ids[group.index + r] as string;
      }

      return r === 0 ? `copy-${copy[1]}` : `copy-${copy[1]}-m${r}`;
    };

    return {
      is_foldable: rel === 0 || rel === inner?.offset ? 1 : 0,
      group_track: ["id", rel === 0 ? 0 : nameOf(parentRel)],
    };
  };

  const place = (): void => {
    for (const [index, id] of order.entries()) {
      tracks.set(
        id,
        // Keep what a test registered on the track; only its index moves.
        registerMockObject(id, {
          path: livePath.track(index),
          properties: tracks.get(id)?.properties ?? {
            devices: [],
            clip_slots: [],
            arrangement_clips: [],
            ...groupProps(id),
          },
        }),
      );
    }

    liveSet.properties.tracks = children(...order);
  };

  const landCopy = (index: unknown): void => {
    const members = group != null && index === group.index ? group.members : 0;

    copies++;

    if (members > 0) {
      groupCopies.add(copies);
    }

    const copy = Array.from({ length: members + 1 }, (_, m) =>
      m === 0 ? `copy-${copies}` : `copy-${copies}-m${m}`,
    );

    order.splice(Number(index) + members + 1, 0, ...copy);
    place();
  };

  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    methods: {
      duplicate_track: (index: unknown) => {
        calls++;

        if (!failing.includes(calls)) {
          landCopy(index);
        }

        return null;
      },
    },
  });

  place();

  return { liveSet, tracks };
}
