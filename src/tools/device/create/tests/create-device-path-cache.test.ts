// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The path cache shares one container walk across a batch, which is only safe
// while nothing in the batch renumbers devices. See with-device-path-cache.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { VALID_DEVICES } from "#src/tools/constants.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

const OUTER_CHAIN = livePath.track(0).device(0).chain(0);
const NESTED = "t0/d0/c0/d0/c0";

let innerChain: RegisteredMockObject;

/** Register a rack at `path` whose only chain is `chainId`. */
function registerRack(id: string, path: string, chainId: string): void {
  registerMockObject(id, {
    path,
    properties: {
      chains: children(chainId),
      can_have_chains: 1,
      can_have_drum_pads: 0,
    },
  });
}

/**
 * Track 0 holding a rack whose first chain holds another rack. Appending an
 * instrument to that chain makes Live re-sort it, so the instrument takes slot
 * 0 and the inner rack — with its own chain under it — slides to slot 1.
 */
function setupNestedRacks(): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children("outerRack") },
  });
  registerRack(
    "outerRack",
    livePath.track(0).device(0).toString(),
    "outerChain",
  );
  registerMockObject("outerChain", {
    path: OUTER_CHAIN,
    properties: { devices: children("innerRack") },
    methods: {
      insert_device: (...args: unknown[]) => {
        if (VALID_DEVICES.instruments.includes(args[0] as never)) {
          registerRack(
            "innerRack",
            OUTER_CHAIN.device(1).toString(),
            "innerChain",
          );
          registerMockObject("innerChain", {
            path: OUTER_CHAIN.device(1).chain(0),
          });
          registerRack(
            "appended",
            OUTER_CHAIN.device(0).toString(),
            "appendedChain",
          );
          registerMockObject("appendedChain", {
            path: OUTER_CHAIN.device(0).chain(0),
            properties: { devices: children() },
            methods: { insert_device: () => ["id", "made"] },
          });
        }

        return ["id", "appended"];
      },
    },
  });
  registerRack("innerRack", OUTER_CHAIN.device(0).toString(), "innerChain");
  innerChain = registerMockObject("innerChain", {
    path: OUTER_CHAIN.device(0).chain(0),
    properties: { devices: children() },
    methods: { insert_device: () => ["id", "made"] },
  });
  registerMockObject("made", {
    path: OUTER_CHAIN.device(0).chain(0).device(0),
  });
}

/**
 * How many devices the inner rack's chain was asked to insert.
 * @returns Call count
 */
function innerInserts(): number {
  return innerChain.call.mock.calls.filter(
    ([method]) => method === "insert_device",
  ).length;
}

/**
 * How many times the call resolved a device nested inside a chain.
 * @returns Resolution count
 */
function nestedDeviceResolves(): number {
  return (
    liveApiBuildStats().byShape.find(
      ([shape]) => shape === "live_set tracks * devices * chains * devices *",
    )?.[1] ?? 0
  );
}

describe("createDevice path cache", () => {
  beforeEach(setupNestedRacks);

  // The third path is spelled through the chain the second one re-sorts, so it
  // no longer names the inner rack. That is refused up front now rather than
  // left to the cache: re-resolving would have found a real device at that
  // path and inserted into the wrong one.
  it("refuses a path spelled through a chain an earlier append re-sorts", () => {
    expect(() =>
      createDevice({
        deviceName: "Operator",
        path: `${NESTED}, t0/d0/c0, ${NESTED}`,
      }),
    ).toThrow(`path entry "${NESTED}" is spelled through "t0/d0/c0"`);

    // Refused before anything ran, so there is nothing to clean up.
    expect(innerInserts()).toBe(0);
  });

  // An audio effect goes on the end, so every path already resolved still
  // stands and the batch keeps sharing one walk.
  it("keeps the cache when the append cannot move anything", () => {
    createDevice({
      deviceName: "Reverb",
      path: `${NESTED}, t0/d0/c0, ${NESTED}`,
    });

    expect(innerInserts()).toBe(2);
    expect(nestedDeviceResolves()).toBe(1);
  });
});
