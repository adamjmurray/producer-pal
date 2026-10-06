// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { DUPLICATE_TYPES } from "#src/tools/constants.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  LIVE_FAILURE,
  childIdAt,
  clearCoveredClips,
  failOnSet,
  hookCalls,
  namedOrder,
  registerScenes,
  registerTracks,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/**
 * Three tracks in a Live Set.
 * @returns The Live Set
 */
function setUpTracks(): RegisteredMockObject {
  registerTracks(3);

  return lookupMockObject("live_set") as RegisteredMockObject;
}

export const duplicateAdapter: WriteToolAdapter = {
  tool: "ppal-duplicate",
  run: (args) => duplicate({ type: "track", ...args }),
  na: {
    namedTwice:
      "a source named twice is two copies, one per destination; copies never write the same place",
    newTwice: "copies are made of existing sources; nothing new is named",
  },

  many: (n) => {
    setUpTracks();

    const order = namedOrder(n);

    // Each source's copy sits right after it, and every copy of an earlier
    // source moves it one place along.
    return {
      args: { id: order.map((i) => `t${i}`).join(",") },
      expected: order.map((i) => ({ path: `t${2 * i + 1}` })),
    };
  },

  unparsable: () => {
    setUpTracks();

    return { path: "t0,not-a-path" };
  },

  // Each type reads its sources its own way.
  unparsableModes: DUPLICATE_TYPES.map((type) => () => {
    setUpTracks();

    return { type, path: "t0,not-a-path" };
  }),

  // One call per kind of destination: each reads toPath its own way.
  unparsableDestinations: DUPLICATE_TYPES.map((type) => () => {
    setUpTracks();

    return { type, id: "t0", toPath: "t1,not-a-path" };
  }),

  unappliable: () => {
    setUpTracks();
    mockNonExistentObjects();

    return {
      args: { id: "t1,nowhere,t0" },
      badIndex: 1,
      landed: [
        { kind: "call", id: "live_set", name: "duplicate_track", args: [1] },
        { kind: "call", id: "live_set", name: "duplicate_track", args: [0] },
      ],
      expected: [{}, {}, {}],
    };
  },

  midway: () => {
    const liveSet = setUpTracks();

    hookCalls(liveSet, /^duplicate_track$/, {
      before: (nth) => {
        if (nth === 2) {
          throw new Error(LIVE_FAILURE);
        }
      },
    });

    return {
      args: { id: "t0,t1,t2" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{}, {}, {}],
    };
  },

  afterChange: () => {
    const liveSet = setUpTracks();

    // The second copy is made, then it won't take its name.
    hookCalls(liveSet, /^duplicate_track$/, {
      after: (nth) => {
        if (nth === 2) {
          // The first copy sits after t0, so t1's copy lands at index 3.
          failOnSet(
            lookupMockObject(
              childIdAt(liveSet, "tracks", 3),
            ) as RegisteredMockObject,
            "name",
          );
        }
      },
    });

    return {
      args: { id: "t0,t1,t2", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: expect.any(String) },
      landed: "made",
      expected: [{}, {}, {}],
    };
  },

  replacedLater: () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMockObject("source", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1, length: 16, loop_end: 16, end_marker: 16 },
    });
    registerMockObject("track0", { path: livePath.track(0) });
    clearCoveredClips(
      registerMockObject("track1", {
        path: livePath.track(1),
        properties: { has_midi_input: 1, arrangement_clips: children() },
      }),
      16,
    );

    // The second copy covers the first whole.
    return {
      args: { type: "clip", id: "source", toPath: "t1[5|1],t1[5|1]" },
      keptArgs: { type: "clip", id: "source", toPath: "t1[5|1]" },
      replaced: [0],
      by: ["t1[5|1]"],
      expected: [{}, { id: expect.any(String), path: "t1[5|1]" }],
    };
  },

  wrongLength: () => {
    setUpTracks();

    return { id: "t0,t1", name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpTracks();

      return {};
    },
    () => {
      setUpTracks();

      return { id: "t0,,t1" };
    },
    () => {
      setUpTracks();

      return { id: "t0", type: "bogus" };
    },
  ],

  countWithDestinations: () => {
    registerScenes(2);

    return { type: "scene", id: "s0", count: 2, toPath: "[5|1],[9|1]" };
  },

  loneSkipped: () => {
    setUpTracks();
    mockNonExistentObjects();

    return { args: { id: "nowhere" }, detail: "nowhere" };
  },
};
