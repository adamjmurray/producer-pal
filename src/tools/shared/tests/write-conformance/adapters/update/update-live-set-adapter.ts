// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import {
  type SimulatedLocator,
  simulateLocators,
} from "#src/tools/live-set/tests/update-live-set-test-helpers.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
  namedOrder,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/** Locators at bars 1, 5, 9 and 13: ids 26, 27, 28 and 29. */
const LOCATORS: SimulatedLocator[] = [
  { time: 0, name: "Intro" },
  { time: 16, name: "Verse" },
  { time: 32, name: "Drop" },
  { time: 48, name: "Outro" },
];

/**
 * Register the Live Set with `count` locators.
 * @param count - How many locators it starts with
 * @returns The Live Set mock
 */
function setUpLocators(count: number): RegisteredMockObject {
  const liveSet = registerMockObject("live_set_id", { path: "live_set" });

  simulateLocators(liveSet, LOCATORS.slice(0, count));

  return liveSet;
}

export const updateLiveSetAdapter: WriteToolAdapter = {
  tool: "ppal-update-live-set",
  // Locators are this tool's targets, so their entries are what comes back.
  run: async (args) => {
    const result = await updateLiveSet(args);

    return result.locator;
  },
  na: {
    replacedLater:
      "a locator at one time is one locator: naming the time twice is a repeat",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpLocators(4);

    const order = namedOrder(n);

    return {
      args: {
        locatorOperation: "rename",
        locatorId: order.map((i) => String(26 + i)).join(","),
        locatorName: order.map((i) => `N${i}`).join(","),
      },
      expected: order.map((i) => ({ operation: "rename", id: String(26 + i) })),
    };
  },

  repeat: () => {
    setUpLocators(3);

    // The same locator by id and by the time it sits at.
    return {
      args: { locatorOperation: "delete", locatorId: "26", locatorTime: "1|1" },
      keptArgs: { locatorOperation: "delete", locatorTime: "1|1" },
      skipped: [0],
      expected: [{}, { operation: "delete", id: "26" }],
    };
  },

  newTwice: () => {
    setUpLocators(0);

    return {
      args: {
        locatorOperation: "create",
        locatorTime: "1|1,5|1",
        locatorName: "A,B",
      },
      expected: [
        { operation: "create", id: "26" },
        { operation: "create", id: "27" },
      ],
    };
  },

  unparsable: () => {
    setUpLocators(3);

    return {
      locatorOperation: "delete",
      locatorTime: "1|1,not-a-time,9|1",
    };
  },

  unappliable: () => {
    setUpLocators(3);

    return {
      // Renaming one that isn't there can't be done; deleting it is a no-op.
      args: {
        locatorOperation: "rename",
        locatorId: "26,999,28",
        locatorName: "A,B,C",
      },
      badIndex: 1,
      landed: [
        { kind: "set", id: "26", name: "name", args: ["A"] },
        { kind: "set", id: "28", name: "name", args: ["C"] },
      ],
      expected: [
        { operation: "rename", id: "26" },
        {},
        { operation: "rename", id: "28" },
      ],
    };
  },

  midway: () => {
    setUpLocators(4);
    failOnSet(lookupMockObject("26") as RegisteredMockObject);

    return {
      args: {
        locatorOperation: "rename",
        locatorId: "28,26,27",
        locatorName: "A,B,C",
      },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [
        { operation: "rename", id: "28" },
        {},
        { operation: "rename", id: "27" },
      ],
    };
  },

  afterChange: () => {
    const liveSet = setUpLocators(0);

    // The second locator is made, then its name is refused.
    hookCalls(liveSet, /^set_or_delete_cue$/, {
      after: (nth) => {
        if (nth === 2) {
          failOnSet(lookupMockObject("27") as RegisteredMockObject);
        }
      },
    });

    return {
      args: {
        locatorOperation: "create",
        locatorTime: "1|1,5|1,9|1",
        locatorName: "A,B,C",
      },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: "27" },
      landed: "created",
      expected: [
        { operation: "create", id: "26" },
        {},
        { operation: "create", id: "28" },
      ],
    };
  },

  wrongLength: () => {
    setUpLocators(3);

    return {
      locatorOperation: "create",
      locatorTime: "1|1,5|1",
      locatorName: "A,B,C",
    };
  },

  refusals: [
    () => {
      setUpLocators(3);

      return { locatorOperation: "create" };
    },
    () => {
      setUpLocators(3);

      return { locatorOperation: "delete" };
    },
    () => {
      setUpLocators(3);

      return { locatorId: "26", locatorName: "A" };
    },
  ],

  loneSkipped: () => {
    setUpLocators(3);

    return {
      args: {
        locatorOperation: "rename",
        locatorId: "999",
        locatorName: "A",
      },
      detail: "999",
    };
  },
};
