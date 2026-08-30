// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Selecting inside a rack. Live keeps this on the rack's own view, so these
// assert the view writes rather than a song-view selection.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
import {
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
} from "./select-test-helpers.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { selectSharedUtilsMockBody } =
    await import("./select-test-helpers.ts");

  return selectSharedUtilsMockBody(await importOriginal());
});

const RACK_PATH = String(livePath.track(0).device(0));

interface DrumRackMocks {
  rackView: RegisteredMockObject;
  pad: RegisteredMockObject;
  chain: RegisteredMockObject;
}

/**
 * Register a Drum Rack on t0/d0 with one populated pad.
 * @param note - The pad's MIDI note (default 36, C1)
 * @param withPads - false builds a rack with no DrumPad objects
 * @returns The rack view, the pad, and its chain
 */
function registerDrumRack(note = 36, withPads = true): DrumRackMocks {
  registerMockObject("rack-id", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      chains: children("chain-0"),
      ...(withPads ? { drum_pads: children("pad-0") } : {}),
    },
  });

  const rackView = registerMockObject("rack-view", {
    path: `${RACK_PATH} view`,
    type: "RackDevice.View",
  });

  const pad = registerMockObject("pad-0", {
    path: livePath.track(0).device(0).drumPad(note),
    type: "DrumPad",
    properties: { note, chains: children("chain-0") },
  });

  const chain = registerMockObject("chain-0", {
    path: livePath.track(0).device(0).chain(0),
    type: "DrumChain",
    properties: { in_note: note },
  });

  return { rackView, pad, chain };
}

describe("select inside a rack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
    setupAppViewMock();
  });

  it("selects a drum pad by path, scrolling it into view", () => {
    const { rackView, pad, chain } = registerDrumRack();
    const songView = setupSongViewMock();

    const result = select({ path: "t0/d0/pC1" });

    expect(songView.call).toHaveBeenCalledWith("select_device", "id rack-id");
    expect(rackView.set).toHaveBeenCalledWith("selected_drum_pad", "id pad-0");
    expect(rackView.set).toHaveBeenCalledWith("selected_chain", "id chain-0");
    expect(rackView.set).toHaveBeenCalledWith("is_showing_chain_devices", 1);
    // Note 36 is row 9; Live shows four rows and doesn't scroll on its own.
    expect(rackView.set).toHaveBeenCalledWith("drum_pads_scroll_position", 8);
    expect(result).toStrictEqual({
      selectedDrumPad: { id: pad.id, path: "t0/d0/pC1" },
    });
    expect(chain.set).not.toHaveBeenCalled();
  });

  it("clamps the pad scroll to the rows Live can show", () => {
    const { rackView } = registerDrumRack(2);

    setupSongViewMock();
    select({ path: "t0/d0/pD-2" });

    expect(rackView.set).toHaveBeenCalledWith("drum_pads_scroll_position", 0);
  });

  it("selects a pad layer by path, and the pad it sounds on", () => {
    const { rackView, pad, chain } = registerDrumRack();

    setupSongViewMock();

    const result = select({ path: "t0/d0/pC1/c0" });

    expect(rackView.set).toHaveBeenCalledWith("selected_chain", "id chain-0");
    expect(rackView.set).toHaveBeenCalledWith("selected_drum_pad", "id pad-0");
    expect(result).toStrictEqual({
      selectedChain: { id: chain.id, path: "t0/d0/c0" },
    });
    expect(pad.set).not.toHaveBeenCalled();
  });

  // Measured on 12.4.3: a copied-on layer comes first in the rack's chain list
  // and last in the pad's. Paths resolve against the rack's, so revealing the
  // pad's would open a layer the reported path doesn't name.
  it("reveals the layer a layered pad's c0 path names", () => {
    registerMockObject("rack-id", {
      path: RACK_PATH,
      type: "RackDevice",
      properties: {
        chains: children("layer-a", "layer-b"),
        drum_pads: children("pad-0"),
      },
    });

    const rackView = registerMockObject("rack-view", {
      path: `${RACK_PATH} view`,
      type: "RackDevice.View",
    });

    registerMockObject("pad-0", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      // The pad lists them the other way round — this is the disagreement.
      properties: { note: 36, chains: children("layer-b", "layer-a") },
    });

    for (const [index, id] of ["layer-a", "layer-b"].entries()) {
      registerMockObject(id, {
        path: livePath.track(0).device(0).chain(index),
        type: "DrumChain",
        properties: { in_note: 36 },
      });
    }

    setupSongViewMock();
    select({ path: "t0/d0/pC1" });

    expect(rackView.set).toHaveBeenCalledWith("selected_chain", "id layer-a");
  });

  it("selects a rack chain by path", () => {
    registerMockObject("rack-id", {
      path: RACK_PATH,
      type: "RackDevice",
    });

    const rackView = registerMockObject("rack-view", {
      path: `${RACK_PATH} view`,
      type: "RackDevice.View",
    });
    const chain = registerMockObject("chain-1", {
      path: livePath.track(0).device(0).chain(1),
      type: "Chain",
    });

    setupSongViewMock();

    const result = select({ path: "t0/d0/c1" });

    expect(rackView.set).toHaveBeenCalledWith("selected_chain", "id chain-1");
    expect(rackView.set).toHaveBeenCalledWith("is_showing_chain_devices", 1);
    // A plain rack chain has no pad, so nothing scrolls.
    expect(rackView.set).not.toHaveBeenCalledWith(
      "drum_pads_scroll_position",
      expect.anything(),
    );
    expect(result).toStrictEqual({
      selectedChain: { id: chain.id, path: "t0/d0/c1" },
    });
  });

  it("selects a drum pad by id", () => {
    const { rackView, pad } = registerDrumRack();
    const songView = setupSongViewMock();

    const result = select({ id: pad.id });

    expect(songView.call).toHaveBeenCalledWith("select_device", "id rack-id");
    expect(rackView.set).toHaveBeenCalledWith("selected_drum_pad", "id pad-0");
    expect(result).toStrictEqual({
      selectedDrumPad: { id: pad.id, path: "t0/d0/pC1" },
    });
  });

  // A pad and a deviceId both write select_device, and the pad's rack goes
  // last, so the pair is only allowed when they name the same device.
  it("takes a deviceId naming the pad's own rack", () => {
    const { rackView, pad } = registerDrumRack();

    setupSongViewMock();

    const result = select({ id: pad.id, deviceId: "id rack-id" });

    expect(rackView.set).toHaveBeenCalledWith("selected_drum_pad", "id pad-0");
    expect(result.selectedDrumPad?.id).toBe(pad.id);
  });

  it("refuses a deviceId naming a device other than the pad's rack", () => {
    const { pad } = registerDrumRack();

    registerMockObject("other-device", {
      path: livePath.track(0).device(1),
      type: "Device",
    });
    setupSongViewMock();

    expect(() => select({ id: pad.id, deviceId: "id other-device" })).toThrow(
      "select failed: deviceId and id name different devices",
    );
  });

  it("falls back to the chain on a rack with no DrumPad objects", () => {
    const { rackView, chain } = registerDrumRack(36, false);

    setupSongViewMock();

    const result = select({ path: "t0/d0/pC1" });

    expect(rackView.set).toHaveBeenCalledWith("selected_chain", "id chain-0");
    expect(rackView.set).not.toHaveBeenCalledWith(
      "selected_drum_pad",
      expect.anything(),
    );
    expect(result).toStrictEqual({
      selectedChain: { id: chain.id, path: "t0/d0/c0" },
    });
  });

  it("opens every rack above a nested chain", () => {
    const outerPath = String(livePath.track(0).device(0));
    const innerPath = String(livePath.track(0).device(0).chain(0).device(0));

    registerMockObject("outer-rack", { path: outerPath, type: "RackDevice" });

    const outerView = registerMockObject("outer-view", {
      path: `${outerPath} view`,
      type: "RackDevice.View",
    });

    registerMockObject("inner-rack", { path: innerPath, type: "RackDevice" });

    const innerView = registerMockObject("inner-view", {
      path: `${innerPath} view`,
      type: "RackDevice.View",
    });

    registerMockObject("outer-chain", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
    });
    registerMockObject("inner-chain", {
      path: livePath.track(0).device(0).chain(0).device(0).chain(1),
      type: "Chain",
    });

    setupSongViewMock();
    select({ path: "t0/d0/c0/d0/c1" });

    // Live doesn't cascade this, so the inner chain stays hidden without it.
    expect(innerView.set).toHaveBeenCalledWith(
      "selected_chain",
      "id inner-chain",
    );
    expect(innerView.set).toHaveBeenCalledWith("is_showing_chain_devices", 1);
    expect(outerView.set).toHaveBeenCalledWith(
      "selected_chain",
      "id outer-chain",
    );
    expect(outerView.set).toHaveBeenCalledWith("is_showing_chain_devices", 1);
  });

  it("focuses the device detail view", () => {
    registerDrumRack();

    const appView = setupAppViewMock();

    setupSongViewMock();
    select({ path: "t0/d0/pC1" });

    expect(appView.call).toHaveBeenCalledWith(
      "focus_view",
      "Detail/DeviceChain",
    );
  });

  it("selects a pad with nothing on it", () => {
    registerMockObject("rack-id", {
      path: RACK_PATH,
      type: "RackDevice",
      properties: { drum_pads: children("pad-0") },
    });

    const rackView = registerMockObject("rack-view", {
      path: `${RACK_PATH} view`,
      type: "RackDevice.View",
    });

    registerMockObject("pad-0", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });

    setupSongViewMock();

    const result = select({ path: "t0/d0/pC1" });

    expect(rackView.set).toHaveBeenCalledWith("selected_drum_pad", "id pad-0");
    expect(rackView.set).not.toHaveBeenCalledWith(
      "selected_chain",
      expect.anything(),
    );
    expect(result).toStrictEqual({
      selectedDrumPad: { id: "pad-0", path: "t0/d0/pC1" },
    });
  });

  it("refuses a pad layer path naming nothing", () => {
    registerDrumRack();
    setupSongViewMock();

    expect(() => select({ path: "t0/d0/pC1/c9" })).toThrow(
      'select failed: nothing at "t0/d0/pC1/c9"',
    );
  });

  it("refuses a pad path naming nothing", () => {
    registerDrumRack();
    setupSongViewMock();

    expect(() => select({ path: "t0/d0/pD1" })).toThrow(
      'select failed: no drum pad at "t0/d0/pD1"',
    );
  });

  it("refuses a chain path naming nothing", () => {
    registerMockObject("rack-id", { path: RACK_PATH, type: "RackDevice" });
    mockNonExistentObjects();
    setupSongViewMock();

    expect(() => select({ path: "t0/d0/c9" })).toThrow(
      'select failed: no chain at "t0/d0/c9"',
    );
  });
});
