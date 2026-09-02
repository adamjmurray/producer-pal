// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "./update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - moving a drum chain", () => {
  let chain0: RegisteredMockObject;
  let chain1: RegisteredMockObject;
  let chain2: RegisteredMockObject;
  let pad36: RegisteredMockObject;

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
        drum_pads: children("pad-36", "pad-38"),
      },
    });

    pad36 = registerMockObject("pad-36", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });
    registerMockObject("pad-38", {
      path: livePath.track(0).device(0).drumPad(38),
      type: "DrumPad",
      properties: { note: 38 },
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
    expect(result).toStrictEqual({ id: "chain-0", path: "t0/d0/pC1/c0" });
  });

  it("should resolve a sharp-accidental target pad note", () => {
    // "pF#1" exercises the [#b]? branch of the drum-pad-note regex; F#1 = 42.
    updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/pF#1" });

    expect(chain0.set).toHaveBeenCalledWith("in_note", 42);
  });

  it("should resolve every pad note the path grammar accepts", () => {
    // One parser for pad notes: a lowercase letter or a negative octave that
    // names a pad everywhere else names one here too. "c-2" is MIDI note 0.
    updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/pc-2" });

    expect(chain0.set).toHaveBeenCalledWith("in_note", 0);
  });

  it("should warn and skip a move to the catch-all pad", () => {
    // "p*" is in_note -1, and Live clamps a drum chain's in_note to 0-127, so
    // the set is silently refused. Reporting the no-op as a move is the bug.
    const result = updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/p*" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'cannot move a drum chain to the catch-all pad "t0/d0/p*"',
      ),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "chain-0", path: "t0/d0/pC1/c0" });
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
    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      chainIds: ["chain-0", "chain-1"],
    });
  });

  // Live layers rather than replaces, so the destination ends up playing both
  // the sound that was there and the one that arrived.
  it("warns that a move onto an occupied pad layers", () => {
    updateDevice({ path: "t0/d0/pC1", toPath: "t0/d0/pD1" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'drum pad "t0/d0/pD1" already had 1 chain(s), so the move layers',
      ),
    );
    // The move still happens — the warning is what the caller was missing.
    expect(chain0.set).toHaveBeenCalledWith("in_note", 38);
    expect(chain1.set).toHaveBeenCalledWith("in_note", 38);
  });

  it("stays quiet moving onto an empty pad", () => {
    updateDevice({ path: "t0/d0/pC1", toPath: "t0/d0/pE1" });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("layers on top"),
    );
  });

  // A pad that is already where it is asked to go has nothing to layer onto.
  it("stays quiet moving a pad onto itself", () => {
    updateDevice({ path: "t0/d0/pC1", toPath: "t0/d0/pC1" });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("layers on top"),
    );
  });

  it("should warn and skip when toPath is not a drum pad path", () => {
    // Should not throw, just warn and skip the move
    const result = updateDevice({
      path: "t0/d0/pC1/c0",
      toPath: "t1",
    });

    expect(capturedWarnings()).toContain('toPath "t1" is not a drum pad path');
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "chain-0", path: "t0/d0/pC1/c0" });
  });

  it("should warn and skip when toPath names a different rack", () => {
    // A pad move is an in_note re-map inside one rack. Honoring only the note
    // would land the pad on D1 of the SOURCE rack and report success.
    const result = updateDevice({
      path: "t0/d0/pC1",
      toPath: "t1/d0/pD1",
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("does not name a pad in this rack"),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(chain1.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      chainIds: ["chain-0", "chain-1"],
    });
  });

  // A chain of a pad in this rack names that pad — the move is an in_note
  // re-map, and "t0/d0/pD1/c0" is the spelling read-device prints for a layered
  // pad's chains.
  it("moves to a pad named by one of its chains", () => {
    updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/pD1/c0" });

    expect(chain0.set).toHaveBeenCalledWith("in_note", 38);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("does not name a pad in this rack"),
    );
  });

  it("should warn and skip when the nested rack a toPath names is not there", () => {
    // The trailing "/d0/pE1" says the pad meant is in a rack under D1, and no
    // such rack exists. Honoring the first pad name instead lands C1 on D1 of
    // this rack and reports it as the move they asked for.
    const result = updateDevice({
      path: "t0/d0/pC1",
      toPath: "t0/d0/pD1/d0/pE1",
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("does not name a pad in this rack"),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(chain1.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      chainIds: ["chain-0", "chain-1"],
    });
  });

  it("should warn and skip when toPath nests under the pad being moved", () => {
    // Reading the first pad here makes the move a no-op reported as a success.
    updateDevice({ path: "t0/d0/pC1", toPath: "t0/d0/pC1/d0/pD1" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("does not name a pad in this rack"),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
  });

  it("should warn and skip when toPath's track does not exist", () => {
    updateDevice({ path: "t0/d0/pC1", toPath: "t99/d0/pB1" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("does not name a pad in this rack"),
    );
    expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
  });

  it("should warn and skip when trying to move the Producer Pal device", () => {
    registerMockObject("this_device", { path: livePath.track(0).device(1) });

    const device = registerMockObject("123", {
      path: livePath.track(0).device(1),
      type: "PluginDevice",
    });

    // The rest of the update still lands — only the move is refused.
    const result = updateDevice({ id: "123", toPath: "t1/d0", name: "X" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("cannot move the Producer Pal device"),
    );
    expect(device.set).toHaveBeenCalledWith("name", "X");
    expect(result).toStrictEqual({ id: "123", path: "t0/d1" });
  });

  it("should warn and skip when trying to move a regular Chain to a drum pad", () => {
    const chain = registerMockObject("123", { type: "Chain" });

    // Should not throw, just warn and skip the move
    const result = updateDevice({
      id: "123",
      toPath: "t0/d0/pD1",
    });

    // A non-drum Chain is not moveable to a pad: warn, and never touch in_note.
    expect(capturedWarnings()).toContain(
      "updateDevice: cannot move Chain id 123",
    );
    expect(chain.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    expect(result).toStrictEqual({ id: "123" });
  });

  // read-device hands out drumPads[].id, so writing one back has to do what
  // the pad's own path does — otherwise most of what it reports is read-only
  // through the handle it advertises.
  describe("addressed by DrumPad id", () => {
    it("moves the whole pad, the way the pad path does", () => {
      const result = updateDevice({ id: "pad-36", toPath: "t0/d0/pE1" });

      expect(chain0.set).toHaveBeenCalledWith("in_note", 40);
      expect(chain1.set).toHaveBeenCalledWith("in_note", 40);
      expect(result).toStrictEqual({
        id: "pad-36",
        path: "t0/d0/pC1",
        chainIds: ["chain-0", "chain-1"],
      });
    });

    it("writes the pad-wide properties to every layer", () => {
      const result = updateDevice({
        id: "pad-36",
        chokeGroup: 3,
        mappedPitch: "C3",
      });

      for (const chain of [chain0, chain1]) {
        expect(chain.set).toHaveBeenCalledWith("choke_group", 3);
        expect(chain.set).toHaveBeenCalledWith("out_note", 60);
      }

      expect(result).toStrictEqual({
        id: "pad-36",
        path: "t0/d0/pC1",
        chainIds: ["chain-0", "chain-1"],
      });
    });

    it("still mutes through the DrumPad itself", () => {
      updateDevice({ id: "pad-36", mute: true });

      expect(pad36.set).toHaveBeenCalledWith("mute", 1);
      expect(chain0.set).not.toHaveBeenCalledWith("mute", expect.anything());
    });

    it("skips the per-layer settings on a stacked pad and names the paths", () => {
      updateDevice({ id: "pad-36", gainDb: -6 });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("t0/d0/pC1/c0, t0/d0/pC1/c1"),
      );
    });

    it("applies a per-layer setting to a single-layer pad", () => {
      updateDevice({ id: "pad-38", name: "Snare" });

      expect(chain2.set).toHaveBeenCalledWith("name", "Snare");
    });
  });

  // Path resolution stops at the first pad, so a nested rack's pad is only
  // findable by walking the live objects. Until it did, the pad spelling —
  // which is what read-device prints — was refused while the chain-index
  // spelling of the identical move went through.
  describe("within a nested Drum Rack", () => {
    let subChainD: RegisteredMockObject;

    beforeEach(() => {
      // Pad C1's first chain holds a Drum Rack of its own, with D1 and E1 pads.
      registerMockObject("chain-0", {
        properties: { in_note: 36, devices: children("nested-rack") },
      });
      registerMockObject("nested-rack", {
        path: livePath.track(0).device(0).chain(0).device(0),
        type: "RackDevice",
        properties: {
          can_have_drum_pads: 1,
          chains: children("sub-chain-d", "sub-chain-e"),
        },
      });
      subChainD = registerMockObject("sub-chain-d", {
        path: livePath.track(0).device(0).chain(0).device(0).chain(0),
        type: "DrumChain",
        properties: { in_note: 38 },
      });
      registerMockObject("sub-chain-e", {
        path: livePath.track(0).device(0).chain(0).device(0).chain(1),
        type: "DrumChain",
        properties: { in_note: 40 },
      });
    });

    it.each([
      ["pad", "t0/d0/pC1/c0/d0"],
      ["chain-index", "t0/d0/c0/d0"],
    ])("moves a nested pad named by the %s spelling", (_name, rack) => {
      updateDevice({ path: `${rack}/pD1`, toPath: `${rack}/pE1` });

      expect(subChainD.set).toHaveBeenCalledWith("in_note", 40);
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("does not name a pad in this rack"),
      );
    });

    it("refuses a move out of the nested rack into the outer one", () => {
      updateDevice({ path: "t0/d0/pC1/c0/d0/pD1", toPath: "t0/d0/pE1" });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("does not name a pad in this rack"),
      );
      expect(subChainD.set).not.toHaveBeenCalledWith(
        "in_note",
        expect.anything(),
      );
    });

    it("refuses a move from the outer rack into the nested one", () => {
      updateDevice({ path: "t0/d0/pC1", toPath: "t0/d0/pC1/c0/d0/pE1" });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("does not name a pad in this rack"),
      );
      expect(chain0.set).not.toHaveBeenCalledWith("in_note", expect.anything());
      expect(chain1.set).not.toHaveBeenCalledWith("in_note", expect.anything());
    });
  });
});

// A toPath that names no place a device can go must warn and skip the move, so
// the rest of the batch still gets its other updates. The bare-track shape
// always did; the nested ones used to throw and take the whole call with them.
describe("updateDevice - a toPath that does not resolve", () => {
  let first: RegisteredMockObject;
  let second: RegisteredMockObject;

  beforeEach(() => {
    mockNonExistentObjects();

    first = registerMockObject("123", { type: "PluginDevice" });
    second = registerMockObject("456", { type: "PluginDevice" });

    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("track-0", { path: livePath.track(0), type: "Track" });

    // t0/d0 is a Drum Rack (chains can't be auto-created in one) and t0/d1 is a
    // plain device (no chains at all).
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_chains: 1,
        can_have_drum_pads: 1,
        chains: children(),
      },
    });
    registerMockObject("plain-device", {
      path: livePath.track(0).device(1),
      type: "PluginDevice",
      properties: { can_have_chains: 0 },
    });
  });

  it.each([
    ["t99", 'move target at path "t99" does not exist'],
    ["t99/d0", 'move target at path "t99/d0" does not exist'],
    ["t99/d0/c0", 'device not moved: Track in path "t99/d0/c0" does not exist'],
    ["t0/d5/c0", 'device not moved: Device in path "t0/d5/c0" does not exist'],
    ["garbage", "device not moved: invalid toPath"],
    ["t0/d0/c0", "device not moved: Auto-creating chains in Drum Racks"],
    [
      "t0/d1/c0",
      'device not moved: Device at path "t0/d1/c0" does not support chains',
    ],
  ])("renames both devices and warns about %s", (toPath, warning) => {
    const result = updateDevice({ id: "123,456", toPath, name: "X" });

    expect(capturedWarnings()).toContainEqual(expect.stringContaining(warning));
    expect(first.set).toHaveBeenCalledWith("name", "X");
    expect(second.set).toHaveBeenCalledWith("name", "X");
    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });
});
