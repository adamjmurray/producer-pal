// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  moveDeviceToPath,
  moveDrumChainToPath,
  stripReturnChainLetter,
  updateMacroCount,
} from "../helpers/update-device-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("moveDeviceToPath", () => {
  let device: RegisteredMockObject;

  beforeEach(() => {
    device = registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
  });

  it("blames toPath, the param every caller took the path from", () => {
    expect(() => moveDeviceToPath(LiveAPI.from(device.path), "x9/d0")).toThrow(
      'invalid toPath "x9/d0" - "x9" is not a track or scene',
    );
  });

  it("returns true after moving the device", () => {
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    registerMockObject("track-1", { path: livePath.track(1), type: "Track" });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d0")).toBe(true);
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id track-1",
      0,
    );
  });

  it("returns false, without moving, when the destination does not exist", () => {
    // Callers report this one themselves: update-device warns, duplicate throws.
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    mockNonExistentObjects();

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t99")).toBe(false);
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(outlet).not.toHaveBeenCalled();
  });
});

describe("moveDrumChainToPath", () => {
  let chain: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("drumrack-id", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0"),
      },
    });

    chain = registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36 },
    });
  });

  it("should warn and skip when toPath has out-of-range note", () => {
    const chainApi = LiveAPI.from(chain.path);

    // G9 parses as a drum pad path but MIDI value (139) exceeds 127
    moveDrumChainToPath(chainApi, "t0/d0/pG9", false);

    expect(outlet).toHaveBeenCalledWith(1, 'invalid note "G9" in toPath');
    expect(chain.set).not.toHaveBeenCalled();
  });
});

describe("updateMacroCount", () => {
  let nonRackDevice: RegisteredMockObject;

  beforeEach(() => {
    nonRackDevice = registerMockObject("non-rack", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { can_have_chains: 0 },
    });
  });

  it("should warn and skip when device is not a rack", () => {
    const deviceApi = LiveAPI.from(nonRackDevice.path);

    updateMacroCount(deviceApi, 8);

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateDevice: macro count only available on rack devices",
    );
    expect(nonRackDevice.call).not.toHaveBeenCalled();
  });
});

describe("stripReturnChainLetter", () => {
  /**
   * A chain mock at a given Live path.
   * @param path - Live API path for the chain
   * @returns The chain LiveAPI object
   */
  function chainAt(path: string): LiveAPI {
    registerMockObject("chain-x", { path, type: "Chain" });

    return LiveAPI.from(path);
  }

  it("leaves the name alone past return chain Z", () => {
    // Live's label for the 27th return chain is unknown, so guessing a prefix
    // to strip would corrupt a name the user typed on purpose.
    const chain = chainAt(`${livePath.track(0).device(0)} return_chains 26`);

    expect(stripReturnChainLetter(chain, "A Reverb")).toBe("A Reverb");
  });

  it("strips the letter for the last chain it can name (Z)", () => {
    const chain = chainAt(`${livePath.track(0).device(0)} return_chains 25`);

    expect(stripReturnChainLetter(chain, "Z Reverb")).toBe("Reverb");
  });
});
