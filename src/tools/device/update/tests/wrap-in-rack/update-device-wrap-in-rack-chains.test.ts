// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  registerDrumRackPadChain,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  registerAudioEffectDevice,
  registerGrowingChainRack,
  registerTrackingChain,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";

// Every wrap puts its devices in series in one chain, like Live's Group.
describe("updateDevice - wrapInRack chain", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    registerAudioEffectDevice("device-0", 0);
    registerAudioEffectDevice("device-1", 1);
    registerTrack0();
    liveSet = registerMockObject("live-set", { path: "live_set" });
    registerTrackingChain(liveSet);
  });

  /**
   * The insert_chain calls the rack received.
   * @param rack - The rack mock
   * @returns Those calls
   */
  function insertChainCalls(rack: RegisteredMockObject): unknown[][] {
    return rack.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "insert_chain",
    );
  }

  it("puts every device in series in the rack's existing chain", () => {
    const rack = registerGrowingChainRack(1);

    const result = updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true });

    expect(insertChainCalls(rack)).toHaveLength(0);
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id chain-0",
      0,
    );
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-1",
      "id chain-0",
      1,
    );
    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 2,
    });
  });

  it("makes exactly one chain when the rack has none", () => {
    const rack = registerGrowingChainRack(0);

    updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true });

    expect(insertChainCalls(rack)).toHaveLength(1);
  });

  it("keeps the named order, not the track order", () => {
    registerGrowingChainRack(1);

    updateDevice({ path: "t0/d1,t0/d0", wrapInRack: true });

    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-1",
      "id chain-0",
      0,
    );
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id chain-0",
      1,
    );
  });

  it("appends past a move Live ignored, and names what didn't land", () => {
    registerGrowingChainRack(1);
    registerTrackingChain(liveSet, (id) => id === "id device-0");

    const result = updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true });

    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-1",
      "id chain-0",
      0,
    );
    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 1,
      reason: 'path "t0/d0" is not in the rack: Live didn\'t move it',
    });
  });
});

// Looking up what to wrap is read-only: a path past a rack's last chain, or to
// an empty pad, names nothing to wrap and must not make chains on the way.
describe("updateDevice - wrapInRack source lookup", () => {
  beforeEach(() => {
    mockNonExistentObjects();
    registerMockObject("live-set", { path: "live_set" });
  });

  it("makes no rack chain for a source past the rack's last chain", () => {
    const rack = registerMockObject("rack-0", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        type: 2,
        chains: children("chain-0"),
        can_have_chains: 1,
        can_have_drum_pads: 0,
      },
    });

    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
    });

    expect(() =>
      updateDevice({ path: "t0/d0/c3/d0", wrapInRack: true }),
    ).toThrow(
      'wrapInRack found no devices to wrap: no device at "t0/d0/c3/d0"',
    );
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it.each(["t0/d0/pD1/d0", "t0/d0/pD1"])(
    "makes no pad chain for the empty-pad source %s",
    (path) => {
      registerDrumRackPadChain();

      expect(() => updateDevice({ path, wrapInRack: true })).toThrow(
        `wrapInRack found no devices to wrap: no device at "${path}"`,
      );
      expect(lookupMockObject("drum-rack")?.call).not.toHaveBeenCalledWith(
        "insert_chain",
      );
    },
  );
});
