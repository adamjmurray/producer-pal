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

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn((): DeviceMove => ({ outcome: "moved" })),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import {
  type DeviceMove,
  moveDeviceToPath as moveDeviceToPathMock,
} from "#src/tools/device/update/helpers/move-device.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import {
  registerSourceChain,
  registerSourceRack,
} from "./chain-copy-fixtures.ts";

const RACK = livePath.track(0).device(0);

/**
 * Register the one device on the source chain, plus the temp track's copy of
 * it that the carry takes across.
 */
function registerCarriedDevice(): void {
  registerMockObject("d-0", { path: `${RACK} chains 0 devices 0` });
  registerMockObject("temp-device", {
    path: `${livePath.track(1)} devices 0 chains 0 devices 0`,
  });
}

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

  const rack = registerSourceRack({ className, hasMacroMappings });

  registerSourceChain(deviceIds);

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

  it("warns once that arrangement params do not apply to a chain", async () => {
    setupRack();

    await duplicate({
      type: "chain",
      id: "chain-0",
      arrangementStart: "5|1",
      arrangementLength: "1bar",
    });

    expect(consoleMock.warn).toHaveBeenCalledTimes(1);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      'arrangementStart/arrangementLength ignored: a chain has no arrangement position (type "chain")',
    );
  });

  it("refuses a rack return chain, saying why", async () => {
    setupRack();
    registerMockObject("return-chain-0", {
      path: `${RACK} return_chains 0`,
      type: "Chain",
      properties: { name: "A Reverb" },
    });

    await expect(
      duplicate({ type: "chain", id: "return-chain-0" }),
    ).rejects.toThrow("is a rack return chain, which cannot be copied");
  });

  it("refuses a chain holding the Producer Pal device, creating nothing", async () => {
    const { rack } = setupRack();

    registerMockObject("this_device", { path: `${RACK} chains 0 devices 0` });

    await expect(duplicate({ type: "chain", id: "chain-0" })).rejects.toThrow(
      "it holds the Producer Pal device",
    );
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  // Live's class names ("AudioEffectGroupDevice") mean nothing to a caller, so
  // the refusal names both racks the way Live's own browser does.
  it("refuses a destination rack of a different kind, in rack-kind words", async () => {
    setupRack();
    registerMockObject("rack-1", {
      path: livePath.track(1).device(0),
      type: "RackDevice",
      properties: { class_name: "AudioEffectGroupDevice", return_chains: [] },
    });

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0" }),
    ).rejects.toThrow(
      "cannot copy a chain from t0/d0 (id rack-0) (an instrument rack) into " +
        '"t1/d0" (an audio effect rack) — a rack only holds chains of its own kind',
    );
  });

  it("says a destination that is no rack at all is not one", async () => {
    setupRack();
    registerMockObject("rack-1", {
      path: livePath.track(1).device(0),
      type: "RackDevice",
      properties: { class_name: "Reverb", return_chains: [] },
    });

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0" }),
    ).rejects.toThrow('into "t1/d0" (not a rack)');
  });

  // The destination keeps its slot, so the caller can pair the entries against
  // the toPath they sent.
  it("keeps a refused destination's slot in a list", async () => {
    setupRack();
    registerMockObject("rack-1", {
      path: livePath.track(1).device(0),
      type: "RackDevice",
      properties: { class_name: "AudioEffectGroupDevice", return_chains: [] },
    });

    const result = await duplicate({
      type: "chain",
      id: "chain-0",
      toPath: "t0/d0,t1/d0",
    });

    expect(result).toStrictEqual([
      { id: "chain-new", path: "t0/d0/c1" },
      {
        path: "t1/d0",
        ok: false,
        reason: expect.stringContaining(
          "a rack only holds chains of its own kind",
        ),
      },
    ]);
    expect(vi.mocked(consoleMock.warn).mock.calls.join()).not.toContain(
      "own kind",
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

    registerCarriedDevice();
    vi.mocked(moveDeviceToPathMock).mockReturnValue({ outcome: "refused" });

    await duplicate({ type: "chain", id: "chain-0" });

    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  // The copy gets the source's fader before its devices arrive, so the move
  // bringing them must not be asked to account for the trim a second time — it
  // would only find the temp track's chain to name.
  it("carries the source chain's trim and hands the move no source", async () => {
    setupRack({ deviceIds: ["d-0"] });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("mixer-0", { path: `${RACK} chains 0 mixer_device` });
    registerMockObject("volume-0", {
      path: `${RACK} chains 0 mixer_device volume`,
      properties: { display_value: -6 },
    });
    registerMockObject("mixer-new", { path: `${RACK} chains 1 mixer_device` });

    const createdVolume = registerMockObject("volume-new", {
      path: `${RACK} chains 1 mixer_device volume`,
    });

    registerCarriedDevice();

    await duplicate({ type: "chain", id: "chain-0" });

    expect(createdVolume.set).toHaveBeenCalledWith("display_value", -6);
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t0/d0/c1/d0",
      null,
      "t0/d0/c1/d0",
    );
  });

  // The temp track sits between the source and a later destination, so the path
  // the move runs on is a track further along than the one the caller asked for.
  it("spells a warning's destination the way the caller asked for it", async () => {
    const DESTINATION_RACK = livePath.track(1).device(0);

    setupRack({ deviceIds: ["d-0"] });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("rack-1", {
      path: DESTINATION_RACK,
      type: "RackDevice",
      properties: { class_name: "InstrumentGroupDevice", return_chains: [] },
      methods: { insert_chain: () => ["id", "chain-new"] },
    });
    registerMockObject("chain-new", {
      path: `${DESTINATION_RACK} chains 1`,
      type: "Chain",
      properties: { name: "", mute: 0, solo: 0, devices: [] },
    });
    registerCarriedDevice();

    await duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0" });

    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t2/d0/c1/d0",
      null,
      "t1/d0/c1/d0",
    );
  });

  it("refuses the call when the rack won't make a chain", async () => {
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

    await expect(duplicate({ type: "chain", id: "chain-0" })).rejects.toThrow(
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

  it("refuses a toPath through a drum pad that reaches no rack", async () => {
    setupRack();

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t0/d0/pC1/d0" }),
    ).rejects.toThrow("no destination rack at toPath");
  });

  it("says on the copy's entry that macro mappings do not come along", async () => {
    setupRack({ hasMacroMappings: 1 });

    const result = (await duplicate({ type: "chain", id: "chain-0" })) as {
      reason?: string;
    };

    expect(result.reason).toContain("macro mappings");
    // The entry carries it, so nothing warns about it.
    expect(vi.mocked(consoleMock.warn)).not.toHaveBeenCalled();
  });

  it("stays quiet about macros on a rack that has none", async () => {
    setupRack();

    const result = await duplicate({ type: "chain", id: "chain-0" });

    expect(result).not.toHaveProperty("reason");
  });

  it("warns that count is ignored, since only one copy is made", async () => {
    setupRack();

    await duplicate({ type: "chain", id: "chain-0", count: 2 });

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "count 2 ignored: chain copies go one per toPath",
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

  it("refuses a toPath naming a chain rather than a rack", async () => {
    setupRack();

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t1/d0/c0" }),
    ).rejects.toThrow("no destination rack at toPath");
  });

  it("says what the track holds when a toPath type segment names nothing", async () => {
    setupRack();
    registerMockObject("track-1", {
      path: livePath.track(1),
      properties: { devices: children() },
    });

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t1/inst" }),
    ).rejects.toThrow('nothing at toPath "t1/inst": t1 has no instrument');
  });

  // A toPath that doesn't parse has no trailing "c+" to strip, so the rack
  // lookup gets it as written and reports the parse error itself — one
  // message about the path, not two.
  it("reports the parse error for a toPath that isn't a path at all", async () => {
    setupRack();
    mockNonExistentObjects();

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "nonsense!" }),
    ).rejects.toThrow(
      'invalid path "nonsense!" - "nonsense!" is not a track or scene',
    );
  });

  it("refuses a toPath naming a device that is not there", async () => {
    setupRack();
    mockNonExistentObjects();

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t9/d9" }),
    ).rejects.toThrow("no destination rack at toPath");
  });

  // The chain still gets made; only its devices are left behind, so the copy
  // reports the chain it has and says what didn't finish.
  it("reports a new chain that has no addressable path", async () => {
    setupRack({ deviceIds: ["d-0"] });

    // An empty path is what Live reports for an object that resolved to
    // nothing, and it is the one thing pathField cannot spell.
    registerMockObject("chain-new", {
      path: "",
      type: "Chain",
      properties: { name: "", mute: 0, solo: 0, devices: [] },
    });

    const result = await duplicate({ type: "chain", id: "chain-0" });

    expect(result).toStrictEqual({
      id: "chain-new",
      reason: expect.stringContaining("no addressable path"),
    });
    expect(vi.mocked(consoleMock.warn).mock.calls.join()).not.toContain(
      "no addressable path",
    );
  });

  // The chain is already in the rack by then, so losing it from the result
  // would cost the caller a chain they now have to clean up by hand.
  it("reports a chain whose devices could not all be copied across", async () => {
    setupRack({ deviceIds: ["d-0"] });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerCarriedDevice();

    vi.mocked(moveDeviceToPathMock).mockReturnValueOnce({
      outcome: "unresolvable",
      reason: "no chain there",
    });

    const result = await duplicate({ type: "chain", id: "chain-0" });

    expect(result).toStrictEqual({
      id: "chain-new",
      path: "t0/d0/c1",
      reason:
        "t0/d0/c0/d0 could not be copied into the new chain: no chain there",
    });
  });

  it("says so when the temp track runs out of devices", async () => {
    setupRack({ deviceIds: ["d-0", "d-1"] });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("d-0", { path: `${RACK} chains 0 devices 0` });
    registerMockObject("d-1", { path: `${RACK} chains 0 devices 1` });
    // Nothing registered at the temp track, so its first device is missing.
    mockNonExistentObjects();

    const result = await duplicate({ type: "chain", id: "chain-0" });

    // The chain exists, so it keeps its entry — short its devices, and saying so.
    expect(result).toStrictEqual({
      id: "chain-new",
      path: "t0/d0/c1",
      reason:
        "t0/d0/c0/d0 could not be copied into the new chain: it is not on the temp track",
    });
    expect(moveDeviceToPathMock).not.toHaveBeenCalled();
  });
});
