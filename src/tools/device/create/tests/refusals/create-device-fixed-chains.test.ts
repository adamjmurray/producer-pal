// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live 13's Mid-Side and Multiband racks have fixed chains and turn every
// insert_chain down, so a path that would add one is refused up front. Live 12
// has no such racks and answers the limit question with a bare 1.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import {
  registerFixedChainRack,
  registerLive12Rack,
} from "../../../tests/helpers/fixed-chain-rack-fixtures.ts";
import { createDevice } from "../../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

const MULTIBAND =
  "Multiband Rack (id rack) has a fixed 3 chains (Low, Mid, High), so it can't take another";
const MID_SIDE =
  "Mid-Side Rack (id rack) has a fixed 2 chains (Mid, Side), so it can't take another";

describe("createDevice — a Live 13 rack with fixed chains", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("refuses a c+ on a Multiband Rack without calling insert_chain", async () => {
    const rack = registerFixedChainRack(0, "multiband");

    await expect(
      createDevice({ device: "Utility", path: "t0/d0/c+" }),
    ).rejects.toThrow(MULTIBAND);
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses the next chain a Mid-Side Rack would need", async () => {
    mockNonExistentObjects();
    const rack = registerFixedChainRack(0, "midSide");

    await expect(
      createDevice({ device: "Utility", path: "t0/d0/c2/d+" }),
    ).rejects.toThrow(MID_SIDE);
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a c<n> far past the last chain with the limit, not the cap", async () => {
    mockNonExistentObjects();
    registerFixedChainRack(0, "midSide");

    await expect(
      createDevice({ device: "Utility", path: "t0/d0/c30/d+" }),
    ).rejects.toThrow(MID_SIDE);
  });

  it("still inserts into a chain the rack has", async () => {
    registerFixedChainRack(0, "multiband");

    await expect(
      createDevice({ device: "Utility", path: "t0/d0/c0/d+" }),
    ).resolves.toStrictEqual({ id: "new-device", path: "t0/d0/c0/d0" });
  });

  it("skips only the refused path in a list", async () => {
    registerFixedChainRack(0, "midSide");

    const result = await createDevice({
      device: "Utility",
      path: "t0/d0/c0/d+,t0/d0/c+",
    });

    expect(result).toStrictEqual([
      { id: "new-device", path: "t0/d0/c0/d0" },
      { path: "t0/d0/c+", ok: false, detail: MID_SIDE },
    ]);
  });
});

describe("createDevice — Live 12 reading max_num_chains as 1", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it.each([1, [1] as [1]])(
    "still appends a chain to a rack with chains (%j)",
    async (answer) => {
      const rack = registerLive12Rack(0, 2, answer);

      await expect(
        createDevice({ device: "Utility", path: "t0/d0/c+" }),
      ).resolves.toStrictEqual({ id: "new-device", path: "t0/d0/c2/d0" });
      expect(rack.call).toHaveBeenCalledWith("insert_chain");
    },
  );

  it("still makes the chain a c<n> names", async () => {
    mockNonExistentObjects();
    const rack = registerLive12Rack(0, 1);

    await expect(
      createDevice({ device: "Utility", path: "t0/d0/c1/d+" }),
    ).resolves.toStrictEqual({
      id: "new-device",
      path: "t0/d0/c1/d0",
      created: "c1",
    });
    expect(rack.call).toHaveBeenCalledWith("insert_chain");
  });
});
