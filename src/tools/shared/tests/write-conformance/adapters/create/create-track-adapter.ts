// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import {
  type RegisteredMockObject,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createTrack } from "#src/tools/track/create/create-track.ts";
import {
  LIVE_FAILURE,
  failCall,
  failOnCreated,
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
  na: {
    unparsableDestination:
      "path is the destination, which the unparsable case covers",
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

    failCall(liveSet, /^create_midi_track$/, 2);

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
    failOnCreated(liveSet, /^create_midi_track$/, 2);

    return {
      args: { path: "t+,t+,t+", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: expect.any(String), path: "t3" },
      landed: "created",
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
