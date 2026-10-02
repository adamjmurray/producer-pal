// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A toPath reaching past a rack's last chain makes the chains below it too, and
// the moved device's entry names them.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockWorkingDeviceMoves,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

const RACK = livePath.track(1).device(0);

/**
 * Register a rack on track 1 whose insert_chain appends a chain that can take
 * a device.
 * @param existing - How many chains it starts with
 * @returns The rack mock
 */
function registerGrowingRack(existing: number): RegisteredMockObject {
  const chainIds: string[] = [];

  /**
   * Add one chain to the rack.
   * @returns The new chain's id
   */
  function addChain(): string {
    const index = chainIds.length / 2;
    const id = `chain-${index}`;

    registerMockObject(id, {
      path: RACK.chain(index),
      type: "Chain",
      properties: { devices: children() },
    });
    chainIds.push("id", id);

    return id;
  }

  for (let i = 0; i < existing; i++) {
    addChain();
  }

  return registerMockObject("rack", {
    path: RACK,
    type: "RackDevice",
    properties: { chains: chainIds, can_have_chains: 1 },
    methods: { insert_chain: () => ["id", addChain()] },
  });
}

describe("updateDevice - a toPath that makes chains", () => {
  beforeEach(() => {
    mockWorkingDeviceMoves();
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("src-0") },
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("rack") },
    });
    registerMockObject("src-0", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
  });

  it("names the chains the move had to make first", () => {
    registerGrowingRack(1);

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c2/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c2/d0",
      created: "c1-c2",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says nothing when the chain the move names is already there", () => {
    registerGrowingRack(2);

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c1/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c1/d0",
    });
  });
});
