// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A move whose destination made chains and was then refused leaves them behind
// empty, so whatever words the refusal has to name them. This is the shared
// move every toPath user goes through.

import { beforeEach, describe, expect, it } from "vitest";
import { moveDeviceToPath } from "../../helpers/move-device.ts";
import {
  children,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

const RACK = livePath.track(1).device(0);

/**
 * Register a rack on track 1 that appends a chain per insert_chain, and a
 * live_set whose move_device does nothing: Live dropping the move.
 * @param existing - How many chains the rack starts with
 */
function registerRackAndDroppedMoves(existing: number): void {
  const chainIds: string[] = [];

  const addChain = (): string => {
    const index = chainIds.length / 2;
    const id = `chain-${index}`;

    registerMockObject(id, {
      path: RACK.chain(index),
      type: "Chain",
      properties: { devices: children() },
    });
    chainIds.push("id", id);

    return id;
  };

  for (let i = 0; i < existing; i++) {
    addChain();
  }

  registerMockObject("rack", {
    path: RACK,
    type: "RackDevice",
    properties: { chains: chainIds, can_have_chains: 1, can_have_drum_pads: 0 },
    methods: { insert_chain: () => ["id", addChain()] },
  });
  registerMockObject("live-set", {
    path: livePath.liveSet,
    methods: { move_device: () => null },
  });
}

describe("a move refused after its toPath made chains", () => {
  beforeEach(() => {
    mockNonExistentObjects();
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

  it("hands back the chains a c+ made, which created leaves out", () => {
    registerRackAndDroppedMoves(1);

    registerMockObject("moving", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    const move = moveDeviceToPath(
      LiveAPI.from("moving"),
      "t1/d0/c+",
      null,
      "t1/d0/c+",
    );

    expect(move).toStrictEqual({
      outcome: "refused",
      reason: undefined,
      madeChains: "c1",
    });
    expect(move).not.toHaveProperty("created");
  });

  it("hands back a gap's chains too, and no created for a failed move", () => {
    registerRackAndDroppedMoves(0);

    registerMockObject("moving", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    const move = moveDeviceToPath(
      LiveAPI.from("moving"),
      "t1/d0/c2/d+",
      null,
      "t1/d0/c2/d+",
    );

    expect(move).toStrictEqual({
      outcome: "refused",
      reason: undefined,
      madeChains: "c0-c2",
    });
    expect(move).not.toHaveProperty("created");
  });

  it("names them in update-device's refusal", () => {
    registerRackAndDroppedMoves(1);

    expect(() => updateDevice({ id: "src-0", toPath: "t1/d0/c+" })).toThrow(
      'not moved to "t1/d0/c+"; left an empty chain: c1',
    );
  });

  it("names them on that target's entry in a list", () => {
    registerRackAndDroppedMoves(1);
    registerMockObject("src-1", {
      path: livePath.track(0).device(1),
      type: "Device",
    });

    expect(
      updateDevice({
        id: "src-0,src-1",
        toPath: "t1/d0/c+,t1/d0/c+",
        name: "Moved",
      }),
    ).toStrictEqual([
      {
        id: "src-0",
        path: "t0/d0",
        detail: 'not moved to "t1/d0/c+"; left an empty chain: c1',
      },
      {
        id: "src-1",
        path: "t0/d1",
        detail: 'not moved to "t1/d0/c+"; left an empty chain: c2',
      },
    ]);
  });
});
