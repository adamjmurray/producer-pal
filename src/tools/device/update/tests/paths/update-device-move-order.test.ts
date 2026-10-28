// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A move renumbers the chain it leaves and the one it lands in, so a later
// toPath spelled through either is refused before anything moves. The rule is
// create-device's; see insertion-order.ts.

import { beforeEach, describe, expect, it } from "vitest";
import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  mockWorkingDeviceMoves,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { validateInsertionOrder } from "#src/tools/shared/device/helpers/path/insertion-order.ts";

/**
 * Register a device on a track.
 * @param id - Its id
 * @param track - The track
 * @param index - Its slot
 * @param type - Live's device type; an audio effect by default
 */
function registerDevice(
  id: string,
  track: number,
  index: number,
  type = LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
): void {
  registerMockObject(id, {
    path: livePath.track(track).device(index),
    type: "Device",
    properties: { type },
  });
}

/**
 * Register a rack with one empty chain on a track.
 * @param id - Its id
 * @param track - The track
 * @param index - Its slot
 */
function registerRack(id: string, track: number, index: number): void {
  registerMockObject(`${id}-c0`, {
    path: livePath.track(track).device(index).chain(0),
    type: "Chain",
    properties: { devices: children() },
  });
  registerMockObject(id, {
    path: livePath.track(track).device(index),
    type: "RackDevice",
    properties: {
      type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
      chains: children(`${id}-c0`),
      can_have_chains: 1,
      can_have_drum_pads: 0,
    },
  });
}

describe("updateDevice - a toPath list an earlier move renumbers", () => {
  let liveSet: RegisteredMockObject;

  // t0: EQ, Rack A, Rack B, Compressor. t1: Rack C, Utility. t2: a MIDI effect.
  beforeEach(() => {
    liveSet = mockWorkingDeviceMoves();
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("eq", "rack-a", "rack-b", "comp") },
    });
    registerDevice("eq", 0, 0);
    registerRack("rack-a", 0, 1);
    registerRack("rack-b", 0, 2);
    registerDevice("comp", 0, 3);
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("rack-c", "util") },
    });
    registerRack("rack-c", 1, 0);
    registerDevice("util", 1, 1);
    registerMockObject("track-2", {
      path: livePath.track(2),
      type: "Track",
      properties: { devices: children("midi-fx") },
    });
    registerDevice("midi-fx", 2, 0, 4);
  });

  it.each([
    [
      "a rack in the chain a device left",
      { path: "t0/d0,t0/d3", toPath: "t0/d1/c0,t0/d1/c0" },
      'toPath entry "t0/d1/c0" is spelled through "t0", which the move of "t0/d0" renumbers.',
    ],
    [
      "the same, with the higher slot first",
      { path: "t0/d3,t0/d0", toPath: "t0/d1/c0,t0/d1/c0" },
      'toPath entry "t0/d1/c0" is spelled through "t0", which the move of "t0/d3" renumbers.',
    ],
    [
      "a rack in the chain an earlier move inserted into",
      { path: "t0/d0,t0/d3", toPath: "t1/d0,t1/d0/c0" },
      'toPath entry "t1/d0/c0" is spelled through "t1", which the move to "t1/d0" renumbers.',
    ],
    [
      "a second slot in one chain",
      { path: "t0/d0,t0/d3", toPath: "t1/d1,t1/d0" },
      'toPath entry "t1/d0" is spelled through "t1", which the move to "t1/d1" renumbers.',
    ],
    [
      "a slot in the chain a device left",
      { id: "eq,util", toPath: "t1/d+,t0/d2" },
      'toPath entry "t0/d2" is spelled through "t0", which the move of id eq renumbers.',
    ],
    [
      "a slot in the chain a device left for a chain the move makes",
      { id: "eq,util", toPath: "t1/d0/c3,t0/d0" },
      'toPath entry "t0/d0" is spelled through "t0", which the move of id eq renumbers.',
    ],
    [
      "a rack after a non-audio effect is appended, which Live re-sorts",
      { id: "midi-fx,comp", toPath: "t1/d+,t1/d0/c0" },
      'toPath entry "t1/d0/c0" is spelled through "t1", which the move to "t1/d+" renumbers.',
    ],
  ])("refuses %s, moving nothing", (_case, args, reason) => {
    expect(() => updateDevice(args)).toThrow(
      `${reason} Make these calls separately.`,
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it.each([
    ["moves into other tracks", "t0/d0,t0/d3", "t1/d0/c0,t1/d0/c0"],
    ["a rack before an appended audio effect", "t0/d0,t0/d3", "t1/d+,t1/d0/c0"],
    ["a slot before an appended audio effect", "t0/d0,t0/d3", "t1/d+,t1/d1"],
  ])("lets %s through", (_case, path, toPath) => {
    expect(() => updateDevice({ path, toPath })).not.toThrow();
    expect(liveSet.call).toHaveBeenCalledTimes(2);
  });

  // Each one skips on its own turn, so it renumbers nothing.
  it.each([
    ["t1/d5,t1/d4", "past the end"],
    ["t1/d5,t1/d3/c0", "past the end"],
    ["t1/inst,t0/d1/c0", "t1 has no instrument"],
    ["t1/s0,t0/d1/c0", "toPath"],
  ])("reads past an entry that moves nothing (%s)", (toPath, reason) => {
    const result = updateDevice({ path: "t0/d0,t0/d3", toPath });

    expect(result).toContainEqual(
      expect.objectContaining({ detail: expect.stringContaining(reason) }),
    );
  });

  // A move to nowhere fails on its turn, so its device never leaves.
  it.each(["t9/d0,t0/d0", "t0/d7/c0,t0/d0", "t9/d0,t9/d0"])(
    "reads past a move to nowhere (%s)",
    (toPath) => {
      mockNonExistentObjects();

      expect(() => updateDevice({ id: "eq,util", toPath })).not.toThrow();
    },
  );

  // Past the end whatever came before, so it still only skips itself.
  it("skips a slot past the end of a chain an earlier move changed", () => {
    const result = updateDevice({ id: "midi-fx,eq", toPath: "t1/d+,t1/d9" });

    expect(result).toContainEqual(
      expect.objectContaining({ detail: expect.stringContaining("t1/d9") }),
    );
  });
});

// The pad a moved drum chain leaves is spelled for the order check even when
// it is the catch-all pad, or its rack has no track path.
describe("updateDevice - moving a drum chain off an unusual pad", () => {
  it("refuses a later toPath spelled through the catch-all pad it leaves", () => {
    registerMockObject("kit", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { can_have_drum_pads: 1, chains: children("catch-all") },
    });
    registerMockObject("catch-all", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: -1 },
    });
    registerMockObject("dev", { path: livePath.track(1).device(0) });

    expect(() =>
      updateDevice({ id: "catch-all,dev", toPath: "t0/d0/pD1,t0/d0/p*/d+" }),
    ).toThrow(
      'toPath entry "t0/d0/p*/d+" is spelled through "t0/d0/p*", which the move of id catch-all renumbers.',
    );
  });

  it("checks a chain whose rack has no device path against its own spelling", () => {
    registerMockObject("odd-chain", {
      path: "live_set scenes 0 chains 0",
      type: "DrumChain",
      properties: { in_note: 36 },
    });
    registerMockObject("dev", { path: livePath.track(1).device(0) });

    // Each entry fails on its own: no pair is refused as out of order.
    const result = updateDevice({
      id: "odd-chain,dev",
      toPath: "t0/d0/pD1,t0/d0/pC1/d+",
    });

    expect(result).toStrictEqual([
      {
        id: "odd-chain",
        ok: false,
        detail: expect.stringContaining("does not name a pad in this rack"),
      },
      {
        id: "dev",
        ok: false,
        detail: 'not moved: nothing at toPath "t0/d0/pC1/d+"',
      },
    ]);
  });
});

// What a move leaves behind when the source can't be spelled the usual way.
const WORDS = { param: "toPath", verb: "move to" } as const;

describe("validateInsertionOrder - what a move leaves", () => {
  beforeEach(() => {
    mockNonExistentObjects();
    registerMockObject("track-1", {
      path: "live_set tracks 1",
      type: "Track",
      properties: { devices: children("dev") },
    });
    registerMockObject("dev", {
      path: "live_set tracks 1 devices 0",
      type: "Device",
    });
  });

  it("names a device that has no device path by its Live path", () => {
    const from = { device: "live_set scenes 0 devices 2" };

    // The leave renumbers nothing a track spelling can reach, so this passes.
    expect(() =>
      validateInsertionOrder(
        [
          { path: "t1/d+", appendRenumbers: false, from },
          { path: "t1/d+", appendRenumbers: false, from },
        ],
        WORDS,
      ),
    ).not.toThrow();
  });

  it("ignores a moved chain's pad when it cannot be spelled as a path", () => {
    expect(() =>
      validateInsertionOrder(
        [
          { path: "t1/d+", appendRenumbers: true, from: { pad: "not a pad" } },
          { path: "t1/d0", appendRenumbers: false },
        ],
        WORDS,
      ),
    ).toThrow(
      'toPath entry "t1/d0" is spelled through "t1", which the move to "t1/d+" renumbers.',
    );
  });

  it("renumbers the pad a drum chain leaves", () => {
    registerMockObject("kit", {
      path: "live_set tracks 0 devices 0",
      type: "RackDevice",
      properties: { can_have_drum_pads: 1, chains: children() },
    });

    expect(() =>
      validateInsertionOrder(
        [
          {
            path: "t1/d+",
            appendRenumbers: false,
            from: { pad: "t0/d0/pC1" },
            named: "id chain-0",
          },
          { path: "t0/d0/pC1/c0/d0", appendRenumbers: false },
        ],
        // "insert at" keeps the later entry from being skipped as unreachable
        { param: "toPath", verb: "insert at" },
      ),
    ).toThrow(
      'toPath entry "t0/d0/pC1/c0/d0" is spelled through "t0/d0/pC1", which the move of id chain-0 renumbers.',
    );
  });

  it("renumbers a pad that a pad move lands on a non-pad path", () => {
    expect(() =>
      validateInsertionOrder(
        [
          { path: "t1", appendRenumbers: true, from: { pad: "t0/d0/pC1" } },
          { path: "t1/d0", appendRenumbers: false },
        ],
        WORDS,
      ),
    ).toThrow('toPath entry "t1/d0" is spelled through "t1"');
  });
});
