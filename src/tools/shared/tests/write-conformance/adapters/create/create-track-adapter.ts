// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  type RegisteredMockObject,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createTrack } from "#src/tools/track/create/create-track.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
  registerTracks,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/** A Live Set with two tracks, which new ones land after. */
function setUpSet(): RegisteredMockObject {
  registerTracks(2);

  return lookupMockObject("live_set") as RegisteredMockObject;
}

export const createTrackAdapter: WriteToolAdapter = {
  tool: "ppal-create-track",
  run: (args) => createTrack(args),
  skip: {
    midway:
      "a throw from Live escapes the call: earlier tracks stay created, later ones are never made, and no entry says so",
    afterChange:
      "a throw while naming the new track escapes the call: the track exists, but no entry reports it",
    loneSkipped:
      "when Live makes no track the call throws a raw TypeError (reading null), not a reason in the tool's words",
  },
  na: {
    unappliable:
      "every entry that parses is a place for a new track; a bad one fails the whole-call checks instead",
    namedTwice: "every entry is a new track, so none can repeat another",
    replacedLater: "a new track is inserted, so it never overwrites one",
  },

  many: (n) => {
    setUpSet();

    return {
      args: { path: Array.from({ length: n }, () => "t+").join(",") },
      // Appended in the order named, so the paths run in order.
      expected: Array.from({ length: n }, (_, i) => ({ path: `t${2 + i}` })),
    };
  },

  newTwice: () => {
    setUpSet();

    return {
      args: { path: "t+,t+", name: "A,B" },
      expected: [{ path: "t2" }, { path: "t3" }],
    };
  },

  unparsable: () => {
    setUpSet();

    return { path: "t+,not-a-path,t+" };
  },

  midway: () => {
    const liveSet = setUpSet();

    hookCalls(liveSet, /^create_midi_track$/, {
      before: (nth) => {
        if (nth === 2) {
          throw new Error(LIVE_FAILURE);
        }
      },
    });

    return {
      args: { path: "t+,t+,t+" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ path: "t2" }, {}, { path: "t3" }],
    };
  },

  afterChange: () => {
    const liveSet = setUpSet();

    // The second track is made, then it won't take its name.
    hookCalls(liveSet, /^create_midi_track$/, {
      after: (nth, _args, result) => {
        if (nth === 2) {
          failOnSet(
            lookupMockObject(
              String((result as string[])[1]),
            ) as RegisteredMockObject,
          );
        }
      },
    });

    return {
      args: { path: "t+,t+,t+", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: expect.any(String), path: "t3" },
      landed: "made",
      expected: [{ path: "t2" }, {}, { path: "t4" }],
    };
  },

  wrongLength: () => {
    setUpSet();

    return { path: "t+,t+", name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpSet();

      return { path: "t+,,t+" };
    },
    () => {
      setUpSet();

      return { path: "t+,t+", color: "#ff0000,#00ff00,#0000ff" };
    },
    () => {
      setUpSet();

      return { path: "t9999" };
    },
  ],

  countWithDestinations: () => {
    setUpSet();

    return { path: "t+,t+", count: 2 };
  },

  loneSkipped: () => {
    const liveSet = setUpSet();

    // Live makes no track.
    liveSet.methods.create_midi_track = () => null;

    return { args: { path: "t+" }, detail: "track" };
  },
};
