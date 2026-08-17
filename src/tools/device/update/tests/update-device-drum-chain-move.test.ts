// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
  updateDevice,
} from "./update-device-test-helpers.ts";

describe("updateDevice - drum chain moving", () => {
  let chain0: RegisteredMockObject;
  let chain1: RegisteredMockObject;
  let chain2: RegisteredMockObject;

  beforeEach(() => {
    // Mock drum rack structure
    // Track 0 has a drum rack at device 0
    // The drum rack has chains with different in_note values
    registerMockObject("drumrack-id", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0", "chain-1", "chain-2"),
      },
    });

    // Chain in_note values: chain-0 and chain-1 are on C1 (36), chain-2 is on D1 (38)
    chain0 = registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    chain1 = registerMockObject("chain-1", {
      path: livePath.track(0).device(0).chain(1),
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    chain2 = registerMockObject("chain-2", {
      path: livePath.track(0).device(0).chain(2),
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
    // An explicit chain path (pC1/c0) moves ONLY that chain, not the whole pad,
    // so the sibling chain on the same in_note is untouched.
    expect(chain1.set).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should resolve a sharp-accidental target pad note", () => {
    // "pF#1" exercises the [#b]? branch of the drum-pad-note regex; F#1 = 42.
    updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/pF#1" });

    expect(chain0.set).toHaveBeenCalledWith("in_note", 42);
  });

  it("should move a chain to the wildcard pad (in_note -1)", () => {
    // "p*" targets the all-notes wildcard, which maps to in_note -1.
    updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/p*" });

    expect(chain0.set).toHaveBeenCalledWith("in_note", -1);
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

    expect(outlet).toHaveBeenCalledWith(
      1,
      'toPath "t1" is not a drum pad path',
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should warn and skip when toPath names a different rack", () => {
    // A pad move is an in_note re-map inside one rack. Honoring only the note
    // would land the pad on D1 of the SOURCE rack and report success.
    const result = updateDevice({
      path: "t0/d0/pC1",
      toPath: "t1/d0/pD1",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("names a different rack"),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(chain1.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("should warn and skip when toPath's track does not exist", () => {
    updateDevice({ path: "t0/d0/pC1", toPath: "t99/d0/pB1" });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("names a different rack"),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
  });

  it("should warn and skip when trying to move a regular Chain to a drum pad", () => {
    const chain = registerMockObject("123", { type: "Chain" });

    // Should not throw, just warn and skip the move
    const result = updateDevice({
      ids: "123",
      toPath: "t0/d0/pD1",
    });

    // A non-drum Chain is not moveable to a pad: warn, and never touch in_note.
    expect(outlet).toHaveBeenCalledWith(1, "cannot move Chain");
    expect(chain.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "123" });
  });
});
