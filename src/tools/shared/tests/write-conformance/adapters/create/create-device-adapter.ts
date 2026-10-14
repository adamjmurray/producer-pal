// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
  registerTracks,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/** Native devices, so nothing has to come from Live's browser. */
const DEVICES = "Reverb,Delay,Compressor";

const APPEND = "t0/d+";

/**
 * A Live Set with one empty track.
 * @returns The track
 */
function setUpTrack(): RegisteredMockObject {
  return registerTracks(1)[0] as RegisteredMockObject;
}

/**
 * `t0/d+` once per device.
 * @param count - How many
 * @returns "t0/d+,t0/d+,..."
 */
function appends(count: number): string {
  return Array.from({ length: count }, () => APPEND).join(",");
}

export const createDeviceAdapter: WriteToolAdapter = {
  tool: "ppal-create-device",
  run: (args) => createDevice({ device: "Reverb", ...args }),
  na: {
    unparsableDestination:
      "path is the destination, which the unparsable case covers",
    namedTwice: "every entry inserts a new device, so none can repeat another",
    replacedLater: "a new device is inserted, so it never overwrites one",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpTrack();

    return {
      args: {
        path: appends(n),
        device: DEVICES.split(",").slice(0, n).join(","),
      },
      // Appended in the order named, so the paths run in order.
      expected: Array.from({ length: n }, (_, i) => ({
        id: expect.any(String),
        path: `t0/d${i}`,
      })),
    };
  },

  newTwice: () => {
    setUpTrack();

    return {
      args: { path: `${APPEND},${APPEND}`, device: "Reverb,Delay" },
      expected: [{ path: "t0/d0" }, { path: "t0/d1" }],
    };
  },

  unparsable: () => {
    setUpTrack();

    return { path: `${APPEND},not-a-path` };
  },

  unappliable: () => {
    setUpTrack();
    mockNonExistentObjects();

    return {
      args: { path: `${APPEND},t9/d+,${APPEND}` },
      badIndex: 1,
      landed: [
        { kind: "call", id: "t0", name: "insert_device" },
        { kind: "call", id: "t0", name: "insert_device" },
      ],
      expected: [{ path: "t0/d0" }, {}, { path: "t0/d1" }],
    };
  },

  midway: () => {
    const track = setUpTrack();

    hookCalls(track, /^insert_device$/, {
      before: (nth) => {
        if (nth === 2) {
          throw new Error(LIVE_FAILURE);
        }
      },
    });

    return {
      args: { path: appends(3), device: DEVICES },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ path: "t0/d0" }, {}, { path: "t0/d1" }],
    };
  },

  afterChange: () => {
    const track = setUpTrack();

    // The second device goes in, then it won't take its name.
    hookCalls(track, /^insert_device$/, {
      after: (nth, _args, result) => {
        if (nth === 2) {
          failOnSet(
            lookupMockObject(
              String((result as string[])[1]),
            ) as RegisteredMockObject,
            "name",
          );
        }
      },
    });

    return {
      args: { path: appends(3), device: DEVICES, name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: expect.any(String), path: "t0/d1" },
      landed: "created",
      expected: [{ path: "t0/d0" }, {}, { path: "t0/d2" }],
    };
  },

  wrongLength: () => {
    setUpTrack();

    return { path: `${APPEND},${APPEND}`, name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpTrack();

      return { path: `${APPEND},,${APPEND}` };
    },
    () => {
      setUpTrack();

      return { path: `${APPEND},${APPEND}`, device: DEVICES };
    },
    () => {
      setUpTrack();

      return { path: "" };
    },
  ],

  loneSkipped: () => {
    setUpTrack();
    mockNonExistentObjects();

    return { args: { path: "t9/d+" }, detail: "t9" };
  },
};
