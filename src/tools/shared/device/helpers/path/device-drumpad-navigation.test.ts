// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  drumPadIdsByNote,
  findDrumPad,
  navigateRemainingSegments,
  resolveDrumPadFromPath,
  resolveDrumPadGroup,
} from "./device-drumpad-navigation.ts";

const RACK_PATH = "live_set tracks 0 devices 0";

/**
 * Register a rack device plus a single C1 (in_note 36) drum chain that holds two
 * devices. Enough surface to drive both navigators: the rack exposes chains,
 * return_chains, and devices; the chain exposes its own devices.
 * @returns The rack LiveAPI handle
 */
function registerRackWithChain(): LiveAPI {
  registerMockObject("rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      chains: ["id", "chain0"],
      return_chains: ["id", "rchain0"],
      devices: ["id", "dev0", "id", "dev1"],
    },
  });
  registerMockObject("chain0", {
    type: "DrumChain",
    properties: {
      in_note: 36,
      devices: ["id", "cdev0", "id", "cdev1"],
    },
  });
  registerMockObject("rchain0", { type: "Chain" });
  registerMockObject("dev0", { type: "Device" });
  registerMockObject("dev1", { type: "Device" });
  registerMockObject("cdev0", { type: "Device" });
  registerMockObject("cdev1", { type: "Device" });

  return LiveAPI.from(RACK_PATH);
}

describe("navigateRemainingSegments", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("returns the start device unchanged for empty segments", () => {
    const rack = registerRackWithChain();

    expect(navigateRemainingSegments(rack, [])).toStrictEqual({
      target: rack,
      targetType: "device",
    });
  });

  it("resolves a chain segment and reports the chain target type", () => {
    const rack = registerRackWithChain();

    const result = navigateRemainingSegments(rack, ["c0"]);

    expect(result.targetType).toBe("chain");
    expect(result.target?.id).toBe("chain0");
  });

  it("resolves a return-chain segment", () => {
    const rack = registerRackWithChain();

    const result = navigateRemainingSegments(rack, ["rc0"]);

    expect(result.targetType).toBe("chain");
    expect(result.target?.id).toBe("rchain0");
  });

  it("resolves a device segment", () => {
    const rack = registerRackWithChain();

    const result = navigateRemainingSegments(rack, ["d1"]);

    expect(result.targetType).toBe("device");
    expect(result.target?.id).toBe("dev1");
  });

  it("returns a null chain target for a bare 'p' with no note", () => {
    const rack = registerRackWithChain();

    expect(navigateRemainingSegments(rack, ["p"])).toStrictEqual({
      target: null,
      targetType: "chain",
    });
  });

  it("returns the current (chain) target type for an unrecognized trailing segment", () => {
    // After a valid chain, an unknown segment falls to the else branch, which
    // reports the *current* target type ("chain"), not the initial "device".
    const rack = registerRackWithChain();

    expect(navigateRemainingSegments(rack, ["c0", "zz"])).toStrictEqual({
      target: null,
      targetType: "chain",
    });
  });

  it("stops at a missing chain without dereferencing a following segment", () => {
    // Chain index 9 is out of range → null. A trailing "d0" must NOT be
    // navigated off the null chain (would throw); resolution returns null chain.
    const rack = registerRackWithChain();

    expect(navigateRemainingSegments(rack, ["c9", "d0"])).toStrictEqual({
      target: null,
      targetType: "chain",
    });
  });

  it("reports a device target type for a missing device index", () => {
    const rack = registerRackWithChain();

    expect(navigateRemainingSegments(rack, ["d9"])).toStrictEqual({
      target: null,
      targetType: "device",
    });
  });

  it("stops at a missing device without dereferencing a following segment", () => {
    const rack = registerRackWithChain();

    expect(navigateRemainingSegments(rack, ["d9", "d0"])).toStrictEqual({
      target: null,
      targetType: "device",
    });
  });
});

describe("resolveDrumPadFromPath", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("returns a null chain target when the rack device does not exist", () => {
    registerMockObject("0", { path: RACK_PATH });

    expect(resolveDrumPadFromPath(RACK_PATH, "C1", [])).toStrictEqual({
      target: null,
      targetType: "chain",
    });
  });

  it("resolves the pad's chain when no further segments are given", () => {
    registerRackWithChain();

    const result = resolveDrumPadFromPath(RACK_PATH, "C1", []);

    expect(result.targetType).toBe("chain");
    expect(result.target?.id).toBe("chain0");
  });

  it("resolves a device inside the pad chain", () => {
    registerRackWithChain();

    const result = resolveDrumPadFromPath(RACK_PATH, "C1", ["c0", "d1"]);

    expect(result.targetType).toBe("device");
    expect(result.target?.id).toBe("cdev1");
  });

  it("returns a null device target when the post-chain segment is not a device", () => {
    // nextSegment "x1" does not start with "d"; even though the chain holds a
    // device at index 1, resolution must NOT treat "x1" as device index 1.
    registerRackWithChain();

    expect(resolveDrumPadFromPath(RACK_PATH, "C1", ["c0", "x1"])).toStrictEqual(
      {
        target: null,
        targetType: "device",
      },
    );
  });

  it("returns a null device target for a negative device index without throwing", () => {
    // "d-1" parses to -1; the guard must catch it and return null rather than
    // indexing devices[-1] (which would throw on the assertDefined below it).
    registerRackWithChain();

    expect(
      resolveDrumPadFromPath(RACK_PATH, "C1", ["c0", "d-1"]),
    ).toStrictEqual({
      target: null,
      targetType: "device",
    });
  });
});

describe("findDrumPad", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("returns null when the rack device does not exist", () => {
    registerMockObject("0", { path: RACK_PATH });

    expect(findDrumPad(RACK_PATH, "C1")).toBeNull();
  });

  it("returns null for a note segment that is not a note name", () => {
    registerRackWithChain();

    expect(findDrumPad(RACK_PATH, "nope")).toBeNull();
  });
});

describe("resolveDrumPadGroup", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("returns null when the rack device does not exist", () => {
    registerMockObject("0", { path: RACK_PATH });

    expect(resolveDrumPadGroup(RACK_PATH, "C1")).toBeNull();
  });

  it("returns null for a note segment that is not a note name", () => {
    registerRackWithChain();

    expect(resolveDrumPadGroup(RACK_PATH, "nope")).toBeNull();
  });

  it("returns null when the rack routes no chain to the pad", () => {
    registerRackWithChain();

    expect(resolveDrumPadGroup(RACK_PATH, "C2")).toBeNull();
  });

  it("returns the pad's chains for a note the rack routes", () => {
    registerRackWithChain();

    const group = resolveDrumPadGroup(RACK_PATH, "C1");

    expect(group?.chains.map((chain) => chain.id)).toStrictEqual(["chain0"]);
  });
});

describe("drumPadIdsByNote", () => {
  /**
   * Register a rack the way Live lays one out: a pad for every MIDI note, in
   * note order, so the list index is the note.
   * @param padCount - How many pads to register
   * @returns The rack LiveAPI handle
   */
  function registerNoteOrderedRack(padCount: number): LiveAPI {
    registerMockObject("rack", {
      path: RACK_PATH,
      type: "RackDevice",
      properties: {
        drum_pads: Array.from({ length: padCount }, (_, note) => [
          "id",
          `pad${String(note)}`,
        ]).flat(),
      },
    });

    for (let note = 0; note < padCount; note++) {
      registerMockObject(`pad${String(note)}`, {
        path: `${RACK_PATH} drum_pads ${String(note)}`,
        type: "DrumPad",
        properties: { note },
      });
    }

    return LiveAPI.from(RACK_PATH);
  }

  it("keys a note-ordered rack's pads without the id prefix", () => {
    const ids = drumPadIdsByNote(registerNoteOrderedRack(8));

    // Bare, because that is the form a pad id goes out in and comes back in.
    expect(ids.get(0)).toBe("pad0");
    expect(ids.get(5)).toBe("pad5");
    expect(ids.size).toBe(8);
  });

  it("reads each pad's note when the list is not in note order", () => {
    // A fixture — or a Live that ever reordered the list — puts pad 36 first.
    registerMockObject("rack", {
      path: RACK_PATH,
      type: "RackDevice",
      properties: { drum_pads: ["id", "pad36", "id", "pad38"] },
    });
    registerMockObject("pad36", { type: "DrumPad", properties: { note: 36 } });
    registerMockObject("pad38", { type: "DrumPad", properties: { note: 38 } });

    const ids = drumPadIdsByNote(LiveAPI.from(RACK_PATH));

    expect(ids.get(36)).toBe("pad36");
    expect(ids.get(38)).toBe("pad38");
    expect(ids.get(0)).toBeUndefined();
  });

  it("has no pads for a drum rack nested in a drum pad", () => {
    registerMockObject("rack", {
      path: RACK_PATH,
      type: "RackDevice",
      properties: { drum_pads: [] },
    });

    expect(drumPadIdsByNote(LiveAPI.from(RACK_PATH)).size).toBe(0);
  });
});
