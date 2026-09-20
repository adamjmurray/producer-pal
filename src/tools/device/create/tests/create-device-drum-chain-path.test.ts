// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Pad C1 holds two layers and pad D1 one, so the rack's two chain numberings
// disagree: pC1/c0 and pC1/c1 are chains 0 and 2, and pD1/c0 is chain 1.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LAYERED_CHAIN_NOTES,
  registerLayeredDrumRack,
} from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

describe("createDevice — drum chain path spelling", () => {
  beforeEach(() => {
    registerLayeredDrumRack({
      chainMethods: (index) => ({
        insert_device: () => ["id", `device-in-chain-${String(index)}`],
      }),
    });

    for (const index of LAYERED_CHAIN_NOTES.keys()) {
      registerMockObject(`device-in-chain-${String(index)}`, {
        path: livePath.track(0).device(0).chain(index).device(0),
      });
    }
  });

  it("echoes the pad spelling the call supplied", async () => {
    expect(
      await createDevice({ device: "Simpler", path: "t0/d0/pC1/c1" }),
    ).toStrictEqual({ id: "device-in-chain-2", path: "t0/d0/pC1/c1/d0" });
  });

  // Rack-relative still resolves the input, but the result always teaches the
  // pad spelling — that is the only one a comma-separated toPath can trust once
  // a pad is layered.
  it("reports the pad spelling even when the call supplied the rack-relative one", async () => {
    expect(
      await createDevice({ device: "Simpler", path: "t0/d0/c2" }),
    ).toStrictEqual({ id: "device-in-chain-2", path: "t0/d0/pC1/c1/d0" });
  });

  // "c1" and "pD1/c0" are two spellings of the same chain (rack chain 1 is
  // pD1's only layer) — proof the two converge on one canonical, pad-relative
  // result regardless of which one the caller wrote.
  it("resolves c1 to the chain pD1/c0 names, and reports it that way either way", async () => {
    expect(
      await createDevice({ device: "Simpler", path: "t0/d0/c1" }),
    ).toStrictEqual({ id: "device-in-chain-1", path: "t0/d0/pD1/c0/d0" });
    expect(
      await createDevice({ device: "Simpler", path: "t0/d0/pD1/c0" }),
    ).toStrictEqual({ id: "device-in-chain-1", path: "t0/d0/pD1/c0/d0" });
  });

  it("keeps the caller's pad spelling when the path names a position", async () => {
    expect(
      await createDevice({ device: "Simpler", path: "t0/d0/pC1/c1/d0" }),
    ).toStrictEqual({ id: "device-in-chain-2", path: "t0/d0/pC1/c1/d0" });
  });

  it("spells a pad's first layer through the pad it was written with", async () => {
    expect(
      await createDevice({ device: "Simpler", path: "t0/d0/pC1" }),
    ).toStrictEqual({ id: "device-in-chain-0", path: "t0/d0/pC1/d0" });
  });
});
