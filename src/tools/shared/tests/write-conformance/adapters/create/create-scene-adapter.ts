// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import { createScene } from "#src/tools/scene/create-scene.ts";
import {
  LIVE_FAILURE,
  failCall,
  failOnCreated,
  registerScenes,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/** A Live Set with two scenes, which new ones land after. */
function setUpSet(): RegisteredMockObject {
  registerScenes(2);

  return lookupMockObject("live_set") as RegisteredMockObject;
}

export const createSceneAdapter: WriteToolAdapter = {
  tool: "ppal-create-scene",
  run: (args) => createScene(args),
  na: {
    unparsableDestination:
      "path is the destination, which the unparsable case covers",
    unappliable:
      "every entry that parses is a place for a new scene; a bad one fails the whole-call checks instead",
    namedTwice: "every entry is a new scene, so none can repeat another",
    replacedLater: "a new scene is inserted, so it never overwrites one",
  },

  many: (n) => {
    setUpSet();

    return {
      args: { path: Array.from({ length: n }, () => "s+").join(",") },
      // Appended in the order named, so the paths run in order.
      expected: Array.from({ length: n }, (_, i) => ({ path: `s${2 + i}` })),
    };
  },

  newTwice: () => {
    setUpSet();

    return {
      args: { path: "s+,s+", name: "A,B" },
      expected: [{ path: "s2" }, { path: "s3" }],
    };
  },

  unparsable: () => {
    setUpSet();

    return { path: "s+,not-a-path,s+" };
  },

  midway: () => {
    const liveSet = setUpSet();

    failCall(liveSet, /^create_scene$/, 2);

    return {
      args: { path: "s+,s+,s+" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ path: "s2" }, {}, { path: "s3" }],
    };
  },

  afterChange: () => {
    const liveSet = setUpSet();

    // The second scene is made, then it won't take its name.
    failOnCreated(liveSet, /^create_scene$/, 2);

    return {
      args: { path: "s+,s+,s+", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: expect.any(String), path: "s3" },
      landed: "created",
      expected: [{ path: "s2" }, {}, { path: "s4" }],
    };
  },

  wrongLength: () => {
    setUpSet();

    return { path: "s+,s+", name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpSet();

      return { path: "s+,,s+" };
    },
    () => {
      setUpSet();

      return { path: "s+,s+", color: "#ff0000,#00ff00,#0000ff" };
    },
    () => {
      setUpSet();

      return { path: "s9999" };
    },
  ],

  countWithDestinations: () => {
    setUpSet();

    return { path: "s+,s+", count: 2 };
  },

  loneSkipped: () => {
    const liveSet = setUpSet();

    // Live makes no scene.
    liveSet.methods.create_scene = () => null;
    mockNonExistentObjects();

    return { args: { path: "s+" }, detail: "scene" };
  },
};
