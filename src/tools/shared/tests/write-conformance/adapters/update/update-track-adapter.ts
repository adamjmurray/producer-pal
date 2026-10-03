// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  namedOrder,
  registerTracks,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/** `t2,t0,t1`-style ids, and the entry each should come back as. */
function named(count: number): { ids: string; expected: object[] } {
  const order = namedOrder(count);

  return {
    ids: order.map((i) => `t${i}`).join(","),
    expected: order.map((i) => ({ id: `t${i}`, path: `t${i}` })),
  };
}

export const updateTrackAdapter: WriteToolAdapter = {
  tool: "ppal-update-track",
  run: (args) => updateTrack(args),
  na: {
    newTwice: "updates existing tracks only",
    replacedLater: "no destination: nothing is created or moved",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    registerTracks(n);

    const { ids, expected } = named(n);

    return {
      args: {
        id: ids,
        name: namedOrder(n)
          .map((i) => `N${i}`)
          .join(","),
      },
      expected,
    };
  },

  repeat: () => {
    registerTracks(2);

    // id t0 comes first and path t0 last, so the id mention is the earlier one.
    return {
      args: { id: "t0,t1", path: "t0", name: "A,B,C" },
      keptArgs: { id: "t1", path: "t0", name: "B,C" },
      skipped: [0],
      expected: [{}, { id: "t1", path: "t1" }, { id: "t0", path: "t0" }],
    };
  },

  unparsable: () => {
    registerTracks(2);

    return { path: "t0,not-a-path", name: "A,B" };
  },

  unappliable: () => {
    registerTracks(2);
    mockNonExistentObjects();

    return {
      args: { id: "t1,nowhere,t0", name: "A,B,C" },
      badIndex: 1,
      landed: [
        { kind: "set", id: "t1", name: "name", args: ["A"] },
        { kind: "set", id: "t0", name: "name", args: ["C"] },
      ],
      expected: [{ id: "t1" }, {}, { id: "t0" }],
    };
  },

  midway: () => {
    const [, second] = registerTracks(3);

    failOnSet(second as never);

    return {
      args: { id: "t0,t1,t2", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ id: "t0" }, {}, { id: "t2" }],
    };
  },

  afterChange: () => {
    const [, second] = registerTracks(3);

    failOnSet(second as never, "mute");

    return {
      args: { id: "t0,t1,t2", name: "A,B,C", mute: true },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: "t1" },
      landed: "name",
      expected: [{ id: "t0" }, {}, { id: "t2" }],
    };
  },

  wrongLength: () => {
    registerTracks(2);

    return { id: "t0,t1", name: "A,B,C" };
  },

  refusals: [
    () => {
      registerTracks(2);

      return { name: "A" };
    },
    () => {
      registerTracks(2);

      return { id: "t0,t1", sendGainDb: -3 };
    },
  ],

  loneSkipped: () => {
    registerTracks(1);
    mockNonExistentObjects();

    return { args: { id: "nowhere", name: "A" }, detail: "nowhere" };
  },
};
