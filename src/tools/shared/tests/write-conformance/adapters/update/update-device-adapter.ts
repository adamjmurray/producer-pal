// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { mockWorkingDeviceMoves } from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  namedOrder,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/**
 * Register `count` devices on track 0, ids `d0`, `d1`, ...
 * @param count - How many
 * @returns The devices, in order
 */
function setUpDevices(count: number): RegisteredMockObject[] {
  const ids = Array.from({ length: count }, (_, i) => `d${i}`);

  registerMockObject("track0", {
    path: livePath.track(0),
    properties: { devices: children(...ids) },
  });

  return ids.map((id, i) =>
    registerMockObject(id, {
      path: livePath.track(0).device(i),
      type: "Device",
    }),
  );
}

/**
 * Register `count` chains in a rack on track 0, ids `c0`, `c1`, ...
 * @param count - How many
 * @returns The chains, in order
 */
function setUpChains(count: number): RegisteredMockObject[] {
  const ids = Array.from({ length: count }, (_, i) => `c${i}`);

  registerMockObject("rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: children(...ids), can_have_chains: 1 },
  });

  return ids.map((id, i) =>
    registerMockObject(id, {
      path: livePath.track(0).device(0).chain(i),
      type: "Chain",
    }),
  );
}

export const updateDeviceAdapter: WriteToolAdapter = {
  tool: "ppal-update-device",
  run: (args) => updateDevice(args),
  na: {
    replacedLater:
      "a device moved to a position is inserted there, so nothing is overwritten",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpDevices(n);

    const order = namedOrder(n);

    return {
      args: {
        id: order.map((i) => `d${i}`).join(","),
        name: order.map((i) => `N${i}`).join(","),
      },
      expected: order.map((i) => ({ id: `d${i}`, path: `t0/d${i}` })),
    };
  },

  repeat: () => {
    setUpDevices(2);

    return {
      args: { id: "d0,d1", path: "t0/d0", name: "A,B,C" },
      keptArgs: { id: "d1", path: "t0/d0", name: "B,C" },
      skipped: [0],
      expected: [{}, { id: "d1", path: "t0/d1" }, { id: "d0", path: "t0/d0" }],
    };
  },

  newTwice: () => {
    setUpDevices(2);
    registerMockObject("track1", {
      path: livePath.track(1),
      properties: { devices: children() },
    });
    mockWorkingDeviceMoves();

    return {
      args: { id: "d0,d1", toPath: "t1/d+,t1/d+" },
      expected: [{ id: "d0" }, { id: "d1" }],
    };
  },

  unparsable: () => {
    setUpDevices(2);

    return { path: "t0/d0,not-a-path", name: "A,B" };
  },

  unparsableDestinations: [
    () => {
      setUpDevices(2);
      registerMockObject("track1", { path: livePath.track(1) });
      mockWorkingDeviceMoves();

      // The first move is fine; the bad entry refuses the whole call.
      return { path: "t0/d0,t0/d1", toPath: "t1/d+,not-a-path" };
    },
  ],

  unappliable: () => {
    setUpDevices(2);
    mockNonExistentObjects();

    return {
      args: { id: "d1,nowhere,d0", name: "A,B,C" },
      badIndex: 1,
      landed: [
        { kind: "set", id: "d1", name: "name", args: ["A"] },
        { kind: "set", id: "d0", name: "name", args: ["C"] },
      ],
      expected: [{ id: "d1" }, {}, { id: "d0" }],
    };
  },

  midway: () => {
    const devices = setUpDevices(3);

    failOnSet(devices[1] as RegisteredMockObject);

    return {
      args: { id: "d0,d1,d2", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ id: "d0" }, {}, { id: "d2" }],
    };
  },

  afterChange: () => {
    const chains = setUpChains(3);

    // The name goes on, then the mute is refused.
    failOnSet(chains[1] as RegisteredMockObject, "mute");

    return {
      args: { id: "c0,c1,c2", name: "A,B,C", mute: true },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: "c1" },
      landed: "name",
      expected: [{ id: "c0" }, {}, { id: "c2" }],
    };
  },

  wrongLength: () => {
    setUpDevices(2);

    return { id: "d0,d1", name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpDevices(2);

      return { name: "A" };
    },
    () => {
      setUpDevices(2);

      return { id: "d0,,d1", name: "A,B" };
    },
    () => {
      setUpDevices(2);

      return { id: "d0,d1", wrapInRack: true, mute: true };
    },
    () => {
      setUpDevices(2);

      return { id: "d0,d1", toPath: "t1/d0" };
    },
  ],

  loneSkipped: () => {
    setUpDevices(2);
    mockNonExistentObjects();

    return { args: { id: "nowhere", name: "A" }, detail: "nowhere" };
  },
};
