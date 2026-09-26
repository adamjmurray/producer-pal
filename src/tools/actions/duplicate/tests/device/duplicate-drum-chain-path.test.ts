// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A copy sent to a drum chain comes back spelled through its pad.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerLayeredDrumRack } from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn((): DeviceMove => ({ outcome: "moved" })),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import {
  type DeviceMove,
  moveDeviceToPath as moveDeviceToPathMock,
} from "#src/tools/device/update/helpers/move-device.ts";

const DRUM_RACK = livePath.track(0).device(0);

describe("duplicate — drum chain path spelling", () => {
  beforeEach(() => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerLayeredDrumRack({
      rackProperties: { class_name: "DrumGroupDevice", return_chains: [] },
    });
  });

  it("names a device copy in a drum chain through its pad", async () => {
    registerSourceDevice();
    mockMovesInto(2, 1);

    expect(
      await duplicate({
        type: "device",
        id: "source-device",
        toPath: "t0/d0/pC1/c1",
      }),
    ).toStrictEqual({ id: "copy-0", path: "t0/d0/pC1/c1/d0" });
  });

  it("reports a drum chain copy where a later copy pushed it", async () => {
    registerSourceDevice();
    mockMovesInto(2, 2);

    expect(
      await duplicate({
        type: "device",
        id: "source-device",
        toPath: "t0/d0/pC1/c1,t0/d0/pC1/c1",
      }),
    ).toStrictEqual([
      { id: "copy-0", path: "t0/d0/pC1/c1/d1" },
      { id: "copy-1", path: "t0/d0/pC1/c1/d0" },
    ]);
  });

  // Echoing "c+" back would make another chain when pasted.
  it("names a copy sent to a new chain by the chain it made", async () => {
    registerSourceDevice();
    mockMovesInto(2, 1);

    expect(
      await duplicate({
        type: "device",
        id: "source-device",
        toPath: "t0/d0/pC1/c+",
      }),
    ).toStrictEqual({ id: "copy-0", path: "t0/d0/pC1/c1/d0" });
  });

  it("spells every copy in one response the same way", async () => {
    registerSourceDevice();
    mockMovesInto(0, 2);

    expect(
      await duplicate({
        type: "device",
        id: "source-device",
        toPath: "t0/d0/pC1/d0,t0/d0/pC1/d0",
      }),
    ).toStrictEqual([
      { id: "copy-0", path: "t0/d0/pC1/c0/d1" },
      { id: "copy-1", path: "t0/d0/pC1/c0/d0" },
    ]);
  });

  // A rack nested inside a drum pad: the copy is a plain chain, but the rack
  // holding it is only reachable through the pad the call spelled.
  it("spells a chain copy through the pad path the call named", async () => {
    const nestedRack = `${DRUM_RACK} chains 2 devices 0`;

    registerMockObject("chain-2", {
      path: `${DRUM_RACK} chains 2`,
      type: "DrumChain",
      properties: { in_note: 36, devices: children("nested-rack") },
    });
    registerMockObject("nested-rack", {
      path: nestedRack,
      type: "RackDevice",
      properties: {
        class_name: "InstrumentGroupDevice",
        has_macro_mappings: 0,
        chains: children("nested-chain-0"),
        return_chains: [],
      },
      methods: { insert_chain: () => ["id", "chain-new"] },
    });
    registerMockObject("nested-chain-0", {
      path: `${nestedRack} chains 0`,
      type: "Chain",
      properties: { name: "Source", mute: 0, solo: 0, devices: children() },
    });
    registerMockObject("chain-new", {
      path: `${nestedRack} chains 1`,
      type: "Chain",
      properties: { name: "", mute: 0, solo: 0, devices: [] },
    });

    expect(
      await duplicate({
        type: "chain",
        id: "nested-chain-0",
        toPath: "t0/d0/pC1/c1/d0",
      }),
    ).toStrictEqual({ id: "chain-new", path: "t0/d0/pC1/c1/d0/c1" });
  });
});

/** Register the device the tests copy, at t0/d1 beside the Drum Rack. */
function registerSourceDevice(): void {
  registerMockObject("source-device", {
    path: livePath.track(0).device(1),
    type: "PluginDevice",
  });
}

/**
 * Stand in for Live's moves: each copy is found on the temp track, lands at the
 * front of the rack's chain `chain`, and pushes the earlier copies along.
 * @param chain - The rack chain index every copy lands in
 * @param copies - How many moves to mock
 */
function mockMovesInto(chain: number, copies: number): void {
  const landed = livePath.track(0).device(0).chain(chain);

  registerMockObject("copy-0", { path: livePath.track(1).device(1) });

  for (let move = 0; move < copies; move++) {
    vi.mocked(moveDeviceToPathMock).mockImplementationOnce(() => {
      for (let copy = 0; copy <= move; copy++) {
        registerMockObject(`copy-${String(copy)}`, {
          path: landed.device(move - copy),
        });
      }

      registerMockObject(`copy-${String(move + 1)}`, {
        path: livePath.track(1).device(1),
      });

      return {
        outcome: "moved",
        container: LiveAPI.from(`chain-${String(chain)}`),
      };
    });
  }
}
