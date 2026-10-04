// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  namedOrder,
  registerScenes,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/** `s2,s0,s1`-style ids, and the entry each should come back as. */
function named(count: number): { ids: string; expected: object[] } {
  const order = namedOrder(count);

  return {
    ids: order.map((i) => `s${i}`).join(","),
    expected: order.map((i) => ({ id: `s${i}`, path: `s${i}` })),
  };
}

export const updateSceneAdapter: WriteToolAdapter = {
  tool: "ppal-update-scene",
  run: (args) => updateScene(args),
  na: {
    unparsableDestination:
      "no destination list: path names what is updated, which the unparsable case covers",
    newTwice: "updates existing scenes only",
    replacedLater: "no destination: nothing is created or moved",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    registerScenes(n);

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
    registerScenes(2);

    // id s0 comes first and path s0 last, so the id mention is the earlier one.
    return {
      args: { id: "s0,s1", path: "s0", name: "A,B,C" },
      keptArgs: { id: "s1", path: "s0", name: "B,C" },
      skipped: [0],
      expected: [{}, { id: "s1", path: "s1" }, { id: "s0", path: "s0" }],
    };
  },

  unparsable: () => {
    registerScenes(2);

    return { path: "s0,not-a-path", name: "A,B" };
  },

  unappliable: () => {
    registerScenes(2);
    mockNonExistentObjects();

    return {
      args: { id: "s1,nowhere,s0", name: "A,B,C" },
      badIndex: 1,
      landed: [
        { kind: "set", id: "s1", name: "name", args: ["A"] },
        { kind: "set", id: "s0", name: "name", args: ["C"] },
      ],
      expected: [{ id: "s1" }, {}, { id: "s0" }],
    };
  },

  midway: () => {
    const [, second] = registerScenes(3);

    failOnSet(second as never);

    return {
      args: { id: "s0,s1,s2", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ id: "s0" }, {}, { id: "s2" }],
    };
  },

  afterChange: () => {
    const [, second] = registerScenes(3);

    failOnSet(second as never, "color");

    return {
      args: { id: "s0,s1,s2", name: "A,B,C", color: "#ff0000" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: "s1" },
      landed: "name",
      expected: [{ id: "s0" }, {}, { id: "s2" }],
    };
  },

  wrongLength: () => {
    registerScenes(2);

    return { id: "s0,s1", name: "A,B,C" };
  },

  refusals: [
    () => {
      registerScenes(2);

      return { name: "A" };
    },
    () => {
      registerScenes(2);

      return { id: "s0,s1", timeSignature: "9" };
    },
  ],

  loneSkipped: () => {
    registerScenes(1);
    mockNonExistentObjects();

    return { args: { id: "nowhere", name: "A" }, detail: "nowhere" };
  },
};
