// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Pad C1 holds two layers and pad D1 one, so the rack's two chain numberings
// disagree: pC1/c0 and pC1/c1 are chains 0 and 2, and pD1/c0 is chain 1.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

/** in_note per rack chain: C1 (36) layered twice, D1 (38) once. */
const CHAIN_NOTES = [36, 38, 36];

describe("createDevice — drum chain path spelling", () => {
  beforeEach(() => {
    registerMockObject("track-0", { path: livePath.track(0) });
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        chains: children("chain-0", "chain-1", "chain-2"),
        can_have_drum_pads: 1,
      },
    });

    for (const [index, inNote] of CHAIN_NOTES.entries()) {
      registerMockObject(`chain-${index}`, {
        path: livePath.track(0).device(0).chain(index),
        type: "DrumChain",
        properties: { in_note: inNote, devices: children() },
        methods: { insert_device: () => ["id", `device-in-chain-${index}`] },
      });
      registerMockObject(`device-in-chain-${index}`, {
        path: livePath.track(0).device(0).chain(index).device(0),
      });
    }
  });

  it("echoes the pad spelling the call supplied", () => {
    expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/pC1/c1" }),
    ).toStrictEqual({ id: "device-in-chain-2", path: "t0/d0/pC1/c1/d0" });
  });

  it("echoes the rack-relative spelling the call supplied", () => {
    expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/c2" }),
    ).toStrictEqual({ id: "device-in-chain-2", path: "t0/d0/c2/d0" });
  });

  // The two numberings disagree here: rack chain 1 is pD1's only layer, where
  // pC1/c1 is rack chain 2. A result that swapped spellings would send a
  // follow-up call to the wrong pad.
  it("names different chains for c1 and pC1/c1", () => {
    expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/c1" }),
    ).toStrictEqual({ id: "device-in-chain-1", path: "t0/d0/c1/d0" });
    expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/pD1/c0" }),
    ).toStrictEqual({ id: "device-in-chain-1", path: "t0/d0/pD1/c0/d0" });
  });

  it("keeps the caller's pad spelling when the path names a position", () => {
    expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/pC1/c1/d0" }),
    ).toStrictEqual({ id: "device-in-chain-2", path: "t0/d0/pC1/c1/d0" });
  });

  it("spells a pad's first layer through the pad it was written with", () => {
    expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/pC1" }),
    ).toStrictEqual({ id: "device-in-chain-0", path: "t0/d0/pC1/d0" });
  });
});
