// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { LIVE_FAILURE, namedOrder } from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/**
 * Register `count` tracks, `t0`..., in a Live Set whose `delete_track` does
 * what `onDelete` says for each index, and removes the track otherwise.
 * @param count - How many tracks
 * @param onDelete - Runs first for each delete; `false` leaves the track alone
 */
function setUpTracks(
  count: number,
  onDelete: (index: number) => boolean | void = () => true,
): void {
  const ids = Array.from({ length: count }, (_, i) => `t${i}`);

  simulateMockDeletes();
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...ids) },
    methods: {
      delete_track: (index: unknown) => {
        if (onDelete(Number(index)) !== false) {
          deleteMockObject(`live_set tracks ${String(index)}`);
        }

        return null;
      },
    },
  });

  for (const [i, id] of ids.entries()) {
    registerMockObject(id, { path: livePath.track(i) });
  }
}

export const deleteAdapter: WriteToolAdapter = {
  tool: "ppal-delete",
  run: (args) => deleteObject({ type: "track", ...args }),
  na: {
    unparsableDestination:
      "no destination list: path names what is deleted, which the unparsable case covers",
    newTwice: "deletes existing objects; nothing is created",
    replacedLater: "no destination: nothing is created or moved",
    afterChange:
      "one Live call per target, so nothing has changed before a throw (a drum chain's parking has its own test)",
    wrongLength: "takes no per-target list",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpTracks(n);

    const order = namedOrder(n);

    return {
      args: { id: order.map((i) => `t${i}`).join(",") },
      expected: order.map((i) => ({ id: `t${i}`, deletedPath: `t${i}` })),
    };
  },

  repeat: () => {
    setUpTracks(2);

    // Highest index first, so the writes are t1 then t0 either way.
    return {
      args: { id: "t0,t1", path: "t0" },
      keptArgs: { id: "t1", path: "t0" },
      skipped: [0],
      expected: [
        {},
        { id: "t1", deletedPath: "t1" },
        { id: "t0", deletedPath: "t0" },
      ],
    };
  },

  unparsable: () => {
    setUpTracks(2);

    return { path: "t0,not-a-path" };
  },

  unappliable: () => {
    // Live leaves t1 where it is, which the call finds out afterward.
    setUpTracks(3, (index) => index !== 1);

    return {
      args: { id: "t0,t1,t2" },
      badIndex: 1,
      landed: [
        { kind: "call", id: "live_set", name: "delete_track", args: [2] },
        { kind: "call", id: "live_set", name: "delete_track", args: [0] },
      ],
      expected: [
        { id: "t0", deletedPath: "t0" },
        {},
        { id: "t2", deletedPath: "t2" },
      ],
    };
  },

  midway: () => {
    setUpTracks(3, (index) => {
      if (index === 1) {
        throw new Error(LIVE_FAILURE);
      }
    });

    return {
      args: { id: "t0,t1,t2" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [
        { id: "t0", deletedPath: "t0" },
        {},
        { id: "t2", deletedPath: "t2" },
      ],
    };
  },

  refusals: [
    () => {
      setUpTracks(2);

      return { id: "t0,,t1" };
    },
    () => {
      setUpTracks(2);

      return {};
    },
    () => {
      setUpTracks(2);

      return { id: "t0", type: "bogus" };
    },
  ],

  loneSkipped: () => {
    setUpTracks(2, () => false);
    mockNonExistentObjects();

    return { args: { id: "t0" }, detail: "still exists" };
  },
};
