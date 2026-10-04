// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A path that makes rack chains on the way keeps them when the insert is then
// refused, so the failure has to say they are there.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const RACK = livePath.track(0).device(0);

/**
 * Register an Audio Effect Rack on track 0 whose chains turn down every insert,
 * the way Live refuses an instrument there. Each insert_chain adds a chain.
 * @param existing - How many chains the rack already has
 */
function registerRefusingRack(existing: number): void {
  const chainIds: string[] = [];

  registerMockObject("track-0", { path: livePath.track(0) });

  const addChain = (): string => {
    const index = chainIds.length / 2;
    const id = `chain-${index}`;

    registerMockObject(id, {
      path: RACK.chain(index),
      type: "Chain",
      properties: { devices: children() },
      methods: { insert_device: () => ["id", "0"] },
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
}

describe("createDevice — chains left by a refused insert", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("names the chain a c+ made", async () => {
    registerRefusingRack(2);

    await expect(
      createDevice({ device: "Operator", path: "t0/d0/c+" }),
    ).rejects.toThrow(
      'could not insert "Operator" at end in path "t0/d0/c+"; left an empty chain: c2',
    );
  });

  it("names the run of chains a c<n> past the last one made", async () => {
    mockNonExistentObjects();
    registerRefusingRack(0);

    await expect(
      createDevice({ device: "Operator", path: "t0/d0/c2/d+" }),
    ).rejects.toThrow(
      'could not insert "Operator" at end in path "t0/d0/c2/d+"; left 3 empty chains: c0-c2',
    );
  });

  // The walk makes c1, then finds nothing at its d0: it fails before any insert.
  it("names the chains made before the path itself failed", async () => {
    mockNonExistentObjects();
    registerRefusingRack(1);

    await expect(
      createDevice({ device: "Operator", path: "t0/d0/c1/d0/c0/d+" }),
    ).rejects.toThrow(
      'Device in path "t0/d0/c1/d0/c0/d+" does not exist; left an empty chain: c1',
    );
  });

  it("says nothing when the path made no chain", async () => {
    registerRefusingRack(2);

    await expect(
      createDevice({ device: "Operator", path: "t0/d0/c1" }),
    ).rejects.toThrow(/in path "t0\/d0\/c1"$/);
  });

  it("names them on each target's entry in a list", async () => {
    registerRefusingRack(1);

    expect(
      await createDevice({
        device: "Operator",
        path: "t0/d0/c+,t0/d0/c+",
      }),
    ).toStrictEqual([
      {
        path: "t0/d0/c+",
        ok: false,
        detail:
          'could not insert "Operator" at end in path "t0/d0/c+"; left an empty chain: c1',
      },
      {
        path: "t0/d0/c+",
        ok: false,
        detail:
          'could not insert "Operator" at end in path "t0/d0/c+"; left an empty chain: c2',
      },
    ]);
  });
});
