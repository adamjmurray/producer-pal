// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
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
