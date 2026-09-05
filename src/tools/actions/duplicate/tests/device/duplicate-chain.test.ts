// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

vi.mock(
  import("#src/tools/device/update/helpers/update-device-helpers.ts"),
  () => ({
    moveDeviceToPath: vi.fn((): DeviceMoveOutcome => "moved"),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import {
  type DeviceMoveOutcome,
  moveDeviceToPath as moveDeviceToPathMock,
} from "#src/tools/device/update/helpers/update-device-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

const RACK = livePath.track(0).device(0);

/**
 * Register a rack holding one chain, and the chain insert_chain will produce.
 * @param options - Rack class, the source chain's devices, and macro mappings
 * @returns The rack mock and the chain the copy lands in
 */
function setupRack(
  options: {
    className?: string;
    deviceIds?: string[];
    hasMacroMappings?: number;
  } = {},
) {
  const {
    className = "InstrumentGroupDevice",
    deviceIds = [],
    hasMacroMappings = 0,
  } = options;

  registerMockObject("live_set", { path: livePath.liveSet });

  const rack = registerMockObject("rack-0", {
    path: RACK,
    type: "RackDevice",
    properties: {
      class_name: className,
      has_macro_mappings: hasMacroMappings,
      return_chains: [],
    },
    // insert_chain hands back the new chain's id.
    methods: { insert_chain: () => ["id", "chain-new"] },
  });

  registerMockObject("chain-0", {
    path: `${RACK} chains 0`,
    type: "Chain",
    properties: {
      name: "Source",
      mute: 0,
      solo: 0,
      devices: children(...deviceIds),
    },
  });

  const created = registerMockObject("chain-new", {
    path: `${RACK} chains 1`,
    type: "Chain",
    properties: { name: "", mute: 0, solo: 0, devices: [] },
  });

  return { rack, created };
}

/**
 * Register a Drum Rack holding one drum chain, plus the chain insert_chain
 * will produce — which always arrives on the catch-all note.
 * @param name - The source chain's name
 * @param inNote - The source chain's pad note, or -1 for the catch-all
 * @returns The chain the copy lands in
 */
function setupDrumRack(name: string, inNote: number) {
  registerMockObject("live_set", { path: livePath.liveSet });
  registerMockObject("rack-0", {
    path: RACK,
    type: "RackDevice",
    properties: { class_name: "DrumGroupDevice", return_chains: [] },
    methods: { insert_chain: () => ["id", "chain-new"] },
  });
  registerMockObject("chain-0", {
    path: `${RACK} chains 0`,
    type: "DrumChain",
    properties: { name, mute: 0, solo: 0, in_note: inNote, devices: [] },
  });

  return registerMockObject("chain-new", {
    path: `${RACK} chains 1`,
    type: "DrumChain",
    properties: { name: "", mute: 0, solo: 0, in_note: -1, devices: [] },
  });
}

describe("duplicate - chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a chain in the source's own rack when no toPath is given", async () => {
    const { rack, created } = setupRack();

    const result = await duplicate({ type: "chain", id: "chain-0" });

    expect(rack.call).toHaveBeenCalledWith("insert_chain");
    expect(created.set).toHaveBeenCalledWith("name", "Source");
    expect(result).toStrictEqual({ id: "chain-new", path: "t0/d0/c1" });
  });

  it("names the copy when a name is given", async () => {
    const { created } = setupRack();

    await duplicate({ type: "chain", id: "chain-0", name: "Layer B" });

    expect(created.set).toHaveBeenCalledWith("name", "Layer B");
  });

  it("refuses a rack return chain, saying why", async () => {
    setupRack();
    registerMockObject("return-chain-0", {
      path: `${RACK} return_chains 0`,
      type: "Chain",
      properties: { name: "A Reverb" },
    });

    await duplicate({ type: "chain", id: "return-chain-0" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "is a rack return chain, which cannot be copied",
    );
  });

  it("refuses a destination rack of a different kind", async () => {
    setupRack();
    registerMockObject("rack-1", {
      path: livePath.track(1).device(0),
      type: "RackDevice",
      properties: { class_name: "AudioEffectGroupDevice", return_chains: [] },
    });

    await duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "a rack only holds chains of its own kind",
    );
  });

  // The whole point of copying once rather than per device: N devices must not
  // mean N track duplications.
  it("duplicates the source track once for a chain of several devices", async () => {
    const { created } = setupRack({ deviceIds: ["d-0", "d-1", "d-2"] });
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    for (const id of ["d-0", "d-1", "d-2"]) {
      registerMockObject(id, { path: `${RACK} chains 0 devices 0` });
    }

    registerMockObject("temp-device", {
      path: `${livePath.track(1)} devices 0 chains 0 devices 0`,
    });

    await duplicate({ type: "chain", id: "chain-0" });

    const duplicateCalls = liveSet.call.mock.calls.filter(
      ([name]) => name === "duplicate_track",
    );

    expect(duplicateCalls).toHaveLength(1);
    expect(created.set).toHaveBeenCalledWith("name", "Source");
  });

  it("deletes the temp track even when a device move fails", async () => {
    setupRack({ deviceIds: ["d-0"] });
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    registerMockObject("d-0", { path: `${RACK} chains 0 devices 0` });
    registerMockObject("temp-device", {
      path: `${livePath.track(1)} devices 0 chains 0 devices 0`,
    });
    vi.mocked(moveDeviceToPathMock).mockReturnValue("refused");

    await duplicate({ type: "chain", id: "chain-0" });

    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("warns and skips when the rack refuses to make a chain", async () => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("rack-0", {
      path: RACK,
      type: "RackDevice",
      properties: { class_name: "InstrumentGroupDevice", return_chains: [] },
      // Live answers 1 rather than an id when it won't make one.
      methods: { insert_chain: () => 1 },
    });
    registerMockObject("chain-0", {
      path: `${RACK} chains 0`,
      type: "Chain",
      properties: { name: "Source", mute: 0, solo: 0, devices: [] },
    });

    const result = await duplicate({ type: "chain", id: "chain-0" });

    expect(result).toStrictEqual([]);
    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "could not create a chain",
    );
  });

  it("copies the chain's mute and solo flags", async () => {
    const { created } = setupRack();

    registerMockObject("chain-0", {
      path: `${RACK} chains 0`,
      type: "Chain",
      properties: { name: "Source", mute: 1, solo: 1, devices: [] },
    });

    await duplicate({ type: "chain", id: "chain-0" });

    expect(created.set).toHaveBeenCalledWith("mute", 1);
    expect(created.set).toHaveBeenCalledWith("solo", 1);
  });

  it("copies one chain into each rack a comma-separated toPath names", async () => {
    setupRack();
    const second = registerMockObject("rack-1", {
      path: livePath.track(1).device(0),
      type: "RackDevice",
      properties: { class_name: "InstrumentGroupDevice", return_chains: [] },
      methods: { insert_chain: () => ["id", "chain-new"] },
    });

    const result = await duplicate({
      type: "chain",
      id: "chain-0",
      toPath: "t0/d0,t1/d0",
    });

    expect(second.call).toHaveBeenCalledWith("insert_chain");
    expect(Array.isArray(result)).toBe(true);
  });

  // A Drum Rack's insert_chain appends on the catch-all pad, so the copy has to
  // be put on the source's own note or it lands somewhere nobody asked for.
  it("puts a copied drum chain on its source's pad", async () => {
    const created = setupDrumRack("Kick", 36);

    await duplicate({ type: "chain", id: "chain-0" });

    expect(created.set).toHaveBeenCalledWith("in_note", 36);
  });

  // Live clamps a drum chain's in_note to 0-127, so a source already on the
  // catch-all has no note to hand over.
  it("leaves a catch-all drum chain's note alone", async () => {
    const created = setupDrumRack("Any", -1);

    await duplicate({ type: "chain", id: "chain-0" });

    expect(created.set).not.toHaveBeenCalledWith("in_note", expect.anything());
  });

  it("warns when a toPath through a drum pad reaches no rack", async () => {
    setupRack();

    await duplicate({
      type: "chain",
      id: "chain-0",
      toPath: "t0/d0/pC1/d0",
    });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "no destination rack at toPath",
    );
  });

  it("warns that macro mappings do not come along, but only when there are some", async () => {
    setupRack({ hasMacroMappings: 1 });

    await duplicate({ type: "chain", id: "chain-0" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "macro mappings",
    );
  });

  it("stays quiet about macros on a rack that has none", async () => {
    setupRack();

    await duplicate({ type: "chain", id: "chain-0" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).not.toContain(
      "macro mappings",
    );
  });
  it("warns that count is ignored, since only one copy is made", async () => {
    setupRack();

    await duplicate({ type: "chain", id: "chain-0", count: 2 });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "count parameter ignored for chain duplication",
    );
  });

  it("copies the chain's color", async () => {
    const { created } = setupRack();

    registerMockObject("chain-0", {
      path: `${RACK} chains 0`,
      type: "Chain",
      properties: {
        name: "Source",
        mute: 0,
        solo: 0,
        color: 0xff0000,
        devices: [],
      },
    });

    await duplicate({ type: "chain", id: "chain-0" });

    expect(created.set).toHaveBeenCalledWith("color", 0xff0000);
  });

  it("copies into a rack nested under a drum pad", async () => {
    setupRack();

    const drumRack = registerMockObject("drum-rack", {
      path: livePath.track(1).device(0),
      type: "RackDevice",
      properties: {
        class_name: "DrumGroupDevice",
        chains: children("drum-chain"),
        return_chains: [],
      },
    });

    registerMockObject("drum-chain", {
      path: `${livePath.track(1).device(0)} chains 0`,
      type: "DrumChain",
      properties: { in_note: 36, devices: children("nested-rack") },
    });

    const nested = registerMockObject("nested-rack", {
      path: `${livePath.track(1).device(0)} chains 0 devices 0`,
      type: "RackDevice",
      properties: {
        class_name: "InstrumentGroupDevice",
        return_chains: [],
      },
      methods: { insert_chain: () => ["id", "chain-new"] },
    });

    await duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0/pC1/d0" });

    expect(nested.call).toHaveBeenCalledWith("insert_chain");
    expect(drumRack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("warns when toPath names a chain rather than a rack", async () => {
    setupRack();

    await duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0/c0" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "no destination rack at toPath",
    );
  });

  it("warns when toPath names a device that is not there", async () => {
    setupRack();
    mockNonExistentObjects();

    await duplicate({ type: "chain", id: "chain-0", toPath: "t9/d9" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "no destination rack at toPath",
    );
  });

  // The chain still gets made; only its devices are left behind, so the copy
  // has to say so rather than look like it worked.
  it("warns when the new chain has no addressable path", async () => {
    setupRack({ deviceIds: ["d-0"] });

    // An empty path is what Live reports for an object that resolved to
    // nothing, and it is the one thing pathField cannot spell.
    registerMockObject("chain-new", {
      path: "",
      type: "Chain",
      properties: { name: "", mute: 0, solo: 0, devices: [] },
    });

    await duplicate({ type: "chain", id: "chain-0" });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "no addressable path",
    );
  });

  it("stops copying devices when the temp track runs out of them", async () => {
    setupRack({ deviceIds: ["d-0", "d-1"] });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("d-0", { path: `${RACK} chains 0 devices 0` });
    registerMockObject("d-1", { path: `${RACK} chains 0 devices 1` });
    // Nothing registered at the temp track, so its first device is missing.
    mockNonExistentObjects();

    await duplicate({ type: "chain", id: "chain-0" });

    expect(moveDeviceToPathMock).not.toHaveBeenCalled();
  });
});
