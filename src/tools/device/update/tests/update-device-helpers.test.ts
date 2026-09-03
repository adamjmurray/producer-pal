// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  moveDeviceToPath,
  stripReturnChainLetter,
  updateMacroCount,
} from "../helpers/update-device-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { moveDrumChainToPath } from "../helpers/update-device-drum-move-helpers.ts";

describe("moveDeviceToPath", () => {
  let device: RegisteredMockObject;

  beforeEach(() => {
    device = registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
  });

  it("blames toPath, the param every caller took the path from", () => {
    expect(moveDeviceToPath(LiveAPI.from(device.path), "x9/d0")).toBe(
      "unresolvable",
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'device not moved: invalid toPath "x9/d0" - "x9" is not a track or scene',
      ),
    );
  });

  it("warns and skips a path that names no place a device can go", () => {
    // Resolution throws for these; a caller moving several ids at once would
    // lose the whole batch over one bad destination.
    mockNonExistentObjects();

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t99/d0/c0")).toBe(
      "unresolvable",
    );
    expect(capturedWarnings()).toContain(
      'device not moved: Track in path "t99/d0/c0" does not exist',
    );
  });

  it("spells the destination the way the caller sent it", () => {
    // Device duplication shifts track indices past its temp track, so the path
    // the move used is not the one the user typed.
    mockNonExistentObjects();

    expect(
      moveDeviceToPath(
        LiveAPI.from(device.path),
        "t100/d0/c0",
        LiveAPI.from(device.path),
        "t99/d0/c0",
      ),
    ).toBe("unresolvable");
    expect(capturedWarnings()).toContain(
      'device not moved: Track in path "t99/d0/c0" does not exist',
    );
  });

  it("reports a move once the device is at the destination", () => {
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    // The mock is static, so the destination lists the device from the start;
    // that is what "the move landed" looks like when it is read back.
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("device-0") },
    });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d0")).toBe("moved");
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id track-1",
      0,
    );
  });

  it("reports a refusal when the device is not at the destination afterwards", () => {
    // Live drops a move it won't make without saying so, and a device that
    // never arrived must not be reported as one that did.
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("track-1", { path: livePath.track(1), type: "Track" });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d0")).toBe(
      "refused",
    );
    expect(capturedWarnings()).toContain(
      "Live refused the move of t0/d0 (id device-0)",
    );
  });

  it("names the one refusal Live's own state explains", () => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    });
    registerMockObject("resident", {
      path: livePath.track(1).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("resident") },
    });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d0")).toBe(
      "refused",
    );
    expect(capturedWarnings()).toContain(
      "Live refused the move of t0/d0 (id device-0): the destination already has an instrument, and only one is allowed",
    );
  });

  it("reports a missing destination, without moving", () => {
    // Callers word this one themselves; only they know the path the user sent.
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    mockNonExistentObjects();

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t99")).toBe(
      "no-destination",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toHaveLength(0);
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

    // G9 is note 139, past MIDI's 127, so no pad answers to it.
    moveDrumChainToPath(chainApi, "t0/d0/pG9", false);

    expect(capturedWarnings()).toContain(
      'toPath "t0/d0/pG9" is not a drum pad path',
    );
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

    expect(capturedWarnings()).toContain(
      "updateDevice: macro count only available on rack devices; skipping t0/d0 (id non-rack)",
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
