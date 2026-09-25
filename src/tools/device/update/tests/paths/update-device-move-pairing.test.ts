// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// toPath pairs 1:1 with the targets. A device slot holds one object, so a lone
// destination against several devices would send them all to one place.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  mockWorkingDeviceMoves,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

describe("updateDevice — pairing toPath with the targets", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = mockWorkingDeviceMoves();
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("src-0", "src-1") },
    });
    registerMockObject("src-0", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
    registerMockObject("src-1", {
      path: livePath.track(0).device(1),
      type: "Device",
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children() },
    });
    registerMockObject("track-2", {
      path: livePath.track(2),
      type: "Track",
      properties: { devices: children() },
    });
  });

  it("gives each device the destination at its own position", () => {
    const result = updateDevice({
      id: "src-0,src-1",
      toPath: "t1/d+,t2/d+",
    });

    expect(result).toStrictEqual([
      { id: "src-0", path: "t1/d0" },
      { id: "src-1", path: "t2/d0" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // Repeats are fine: move_device inserts, so nothing is overwritten and the
  // pair lands in the order the call named them.
  it("accepts the same d+ destination twice", () => {
    updateDevice({ id: "src-0,src-1", toPath: "t1/d+,t1/d+" });

    expect(liveSet.call).toHaveBeenNthCalledWith(
      1,
      "move_device",
      "id src-0",
      "id track-1",
      0,
    );
    expect(liveSet.call).toHaveBeenNthCalledWith(
      2,
      "move_device",
      "id src-1",
      "id track-1",
      1,
    );
  });

  // Every path resolves before the first move: resolved afterwards, t0/d1
  // would name src-2, which slid up when src-0 left.
  it("moves the devices the paths named before any of them moved", () => {
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("src-0", "src-1", "src-2") },
    });
    registerMockObject("src-2", {
      path: livePath.track(0).device(2),
      type: "Device",
    });

    const result = updateDevice({
      path: "t0/d0,t0/d1",
      toPath: "t2/d+,t2/d+",
    });

    expect(result).toStrictEqual([
      { id: "src-0", path: "t2/d0" },
      { id: "src-1", path: "t2/d1" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(2);
    expect(liveSet.call).toHaveBeenNthCalledWith(
      2,
      "move_device",
      "id src-1",
      "id track-2",
      1,
    );
  });

  // Each device is named once every move is done: src-1 lands ahead of src-0.
  it("reports a device where a later move pushed it", () => {
    const result = updateDevice({
      id: "src-0,src-1",
      toPath: "t1/d0,t1/d0",
    });

    expect(result).toStrictEqual([
      { id: "src-0", path: "t1/d1" },
      { id: "src-1", path: "t1/d0" },
    ]);
  });

  // A device whose move was refused can still be pushed along by a later one.
  it("reports an unmoved device where a later move pushed it", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      id: "src-0,src-1",
      toPath: "t9/d0,t0/d0",
      name: "Kept,Moved",
    });

    expect(result).toStrictEqual([
      {
        id: "src-0",
        path: "t0/d1",
        reason: 'not moved: nothing at toPath "t9/d0"',
      },
      { id: "src-1", path: "t0/d0" },
    ]);
  });

  // A whole-pad target is named again too: the rack holding it was pushed.
  it("reports a pad where a later move pushed its rack", () => {
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("drum-rack") },
    });
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        chains: children("chain-0"),
        can_have_drum_pads: 1,
        drum_pads: children("pad-36"),
      },
    });
    registerMockObject("pad-36", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });
    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36, devices: children() },
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("mover") },
    });
    registerMockObject("mover", {
      path: livePath.track(1).device(0),
      type: "Device",
    });

    // The mock re-paths only devices; Live carries the pad along with its rack.
    const moveDevice = liveSet.methods.move_device;

    liveSet.methods.move_device = (...args) => {
      moveDevice?.(...args);
      registerMockObject("pad-36", {
        path: livePath.track(0).device(1).drumPad(36),
        type: "DrumPad",
        properties: { note: 36 },
      });

      return null;
    };

    const result = updateDevice({
      path: "t0/d0/pC1,t1/d0",
      toPath: "t0/d0/p*,t0/d0",
      name: "Kick,Moved",
    });

    expect(result).toStrictEqual([
      {
        id: "pad-36",
        path: "t0/d1/pC1",
        chainIds: ["chain-0"],
        reason: expect.stringContaining("catch-all pad"),
      },
      { id: "mover", path: "t0/d0" },
    ]);
  });

  // A path that names nothing still gets its own entry, and the rest move.
  it("reports a path that names nothing in its own slot", () => {
    mockNonExistentObjects();

    const result = updateDevice({
      path: "t0/d0,t0/d5",
      toPath: "t2/d+,t2/d+",
    });

    expect(result).toStrictEqual([
      { id: "src-0", path: "t2/d0" },
      { path: "t0/d5", ok: false, reason: expect.stringContaining("t0/d5") },
    ]);
  });

  it("refuses one destination for several devices, moving nothing", () => {
    expect(() =>
      updateDevice({ path: "t0/d0,t0/d1", toPath: "t1/d1" }),
    ).toThrow(
      "toPath names 1 destination but the call names 2 targets. A " +
        "destination holds one object, so toPath must name one per target, " +
        "in order.",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("refuses more destinations than devices", () => {
    expect(() =>
      updateDevice({ path: "t0/d0", toPath: "t1/d+,t1/d+" }),
    ).toThrow("toPath names 2 destinations but the call names 1 target.");
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("refuses a hole in the destination list", () => {
    expect(() =>
      updateDevice({ path: "t0/d0,t0/d1", toPath: "t1/d+,,t1/d+" }),
    ).toThrow('invalid toPath "t1/d+,,t1/d+" - it has an empty entry');
  });

  it("reads a blank toPath as no move at all", () => {
    const result = updateDevice({ path: "t0/d0,t0/d1", toPath: "" });

    expect(result).toStrictEqual([
      { id: "src-0", path: "t0/d0" },
      { id: "src-1", path: "t0/d1" },
    ]);
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  // wrapInRack sends every device into one new rack, so its toPath is where
  // that rack goes — one destination for the whole call, not a per-device list.
  it("leaves wrapInRack's single destination alone", () => {
    expect(() =>
      updateDevice({ path: "t0/d0,t0/d1", toPath: "t1", wrapInRack: true }),
    ).not.toThrow("toPath names 1 destination");
  });
});
