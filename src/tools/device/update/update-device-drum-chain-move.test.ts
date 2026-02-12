// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "./update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - drum chain moving", () => {
  let chain0: RegisteredMockObject;
  let chain1: RegisteredMockObject;
  let chain2: RegisteredMockObject;

  beforeEach(() => {
    // Mock drum rack structure
    // Track 0 has a drum rack at device 0
    // The drum rack has chains with different in_note values
    registerMockObject("drumrack-id", {
      path: "live_set tracks 0 devices 0",
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0", "chain-1", "chain-2"),
      },
    });

    // Chain in_note values: chain-0 and chain-1 are on C1 (36), chain-2 is on D1 (38)
    chain0 = registerMockObject("chain-0", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    chain1 = registerMockObject("chain-1", {
      path: "live_set tracks 0 devices 0 chains 1",
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    chain2 = registerMockObject("chain-2", {
      path: "live_set tracks 0 devices 0 chains 2",
      type: "DrumChain",
      properties: { in_note: 38 },
    });
  });

  it("should move a single drum chain to a different pad", () => {
    const result = updateDevice({
      path: "t0/d0/pC1/c0",
      toPath: "t0/d0/pD1",
    });

    // Should set in_note to 38 (D1)
    expect(chain0.set).toHaveBeenCalledWith("in_note", 38);
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should move all chains in a drum pad when using pad path", () => {
    const result = updateDevice({
      path: "t0/d0/pC1",
      toPath: "t0/d0/pE1",
    });

    // Should set in_note to 40 (E1) on both chains with in_note=36
    expect(chain0.set).toHaveBeenCalledWith("in_note", 40);
    expect(chain1.set).toHaveBeenCalledWith("in_note", 40);
    // chain-2 has in_note=38 (D1), should not be affected
    expect(chain2.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should warn and skip when toPath is not a drum pad path", () => {
    // Should not throw, just warn and skip the move
    const result = updateDevice({
      path: "t0/d0/pC1/c0",
      toPath: "t1",
    });

    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should warn and skip when trying to move a regular Chain to a drum pad", () => {
    registerMockObject("123", { type: "Chain" });

    // Should not throw, just warn and skip the move
    const result = updateDevice({
      ids: "123",
      toPath: "t0/d0/pD1",
    });

    expect(result).toStrictEqual({ id: "123" });
  });
});
