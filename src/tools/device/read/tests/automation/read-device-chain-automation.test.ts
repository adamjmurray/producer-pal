// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../../read-device.ts";
import { setupDrumPadMocks } from "../drum/read-device-drum-mocks.ts";
import { registerArrangementTrack } from "../read-device-test-helpers.ts";

const UNKNOWN =
  "arrangement automation unknown while the track plays from Session";
const RACK = String(livePath.track(1).device(0));
const RETURN_RACK = String(livePath.returnTrack(0).device(0));

interface MixerStates {
  /** automation_state of the volume, pan and each send */
  volume?: number;
  panning?: number;
  sends?: number[];
  /** The chain's display gain, to show a default-valued field is still named */
  gainDb?: number;
}

describe("readOneDevice chain automation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("names the automated mixer fields of each chain", () => {
    registerArrangementTrack();
    registerRack(RACK, {
      returns: ["A-Echo", "B-Verb"],
      chains: [
        { volume: 1, panning: 2, sends: [0, 1] },
        { volume: 0, panning: 0, sends: [0, 0] },
      ],
    });

    const chains = chainsOf(
      readOneDevice({ path: "t1/d0", include: ["chains"] }),
    );

    expect(chains[0]?.automation).toStrictEqual([
      "gainDb",
      "pan (overridden)",
      "send B-Verb",
    ]);
    expect(chains[1]).not.toHaveProperty("automation");
  });

  it("names a field sitting at its default, which the entry leaves out", () => {
    registerArrangementTrack();
    registerRack(RACK, { chains: [{ volume: 1, gainDb: 0 }] });

    const [chain] = chainsOf(
      readOneDevice({ path: "t1/d0", include: ["chains"] }),
    );

    expect(chain).not.toHaveProperty("gainDb");
    expect(chain?.automation).toStrictEqual(["gainDb"]);
  });

  it("names a send Live gives no return name by its position", () => {
    registerArrangementTrack();
    registerRack(RACK, {
      returns: [""],
      chains: [{ sends: [2] }],
    });

    const [chain] = chainsOf(
      readOneDevice({ path: "t1/d0", include: ["chains"] }),
    );

    expect(chain?.automation).toStrictEqual(["send Return 1 (overridden)"]);
  });

  it("leaves the flag off a chain without a mixer", () => {
    registerArrangementTrack();
    registerRack(RACK, { chains: [{ noMixer: true }] });

    const [chain] = chainsOf(
      readOneDevice({ path: "t1/d0", include: ["chains"] }),
    );

    expect(chain).not.toHaveProperty("automation");
  });

  it.each([
    ["stopped in Session", -2],
    ["a session clip playing", 0],
  ])("drops the flags and says why once when the track is %s", (_l, slot) => {
    registerArrangementTrack(slot);
    registerRack(RACK, {
      chains: [{ volume: 1 }, { volume: 1 }, { volume: 1 }],
    });

    const result = readOneDevice({ path: "t1/d0", include: ["chains"] });

    for (const chain of chainsOf(result)) {
      expect(chain).not.toHaveProperty("automation");
      expect(chain).not.toHaveProperty("detail");
    }

    expect(result.detail).toBe(UNKNOWN);
    expect(slotIndexReads()).toBe(1);
  });

  it("says it once when the params and the chains both can't tell", () => {
    registerArrangementTrack(-2);
    registerRack(RACK, { chains: [{ volume: 1 }] });

    const result = readOneDevice({
      path: "t1/d0",
      include: ["chains", "param-values"],
    });

    expect(result.detail).toBe(UNKNOWN);
  });

  it("says nothing when the rack shows no chain", () => {
    registerArrangementTrack(-2);
    registerRack(RACK, { chains: [{ volume: 1 }] });

    const result = readOneDevice({ path: "t1/d0" });

    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads()).toBe(0);
  });

  it("says nothing for a rack with no chains", () => {
    registerArrangementTrack(-2);
    registerRack(RACK, { chains: [] });

    const result = readOneDevice({ path: "t1/d0", include: ["chains"] });

    expect(result).not.toHaveProperty("detail");
  });

  it("names the fields of a return chain", () => {
    registerArrangementTrack();
    registerRack(RACK, {
      returns: ["Wet"],
      returnChainStates: [{ volume: 2 }],
      chains: [],
    });

    const result = readOneDevice({ path: "t1/d0", include: ["return-chains"] });

    expect(
      (result.returnChains as Record<string, unknown>[])[0]?.automation,
    ).toStrictEqual(["gainDb (overridden)"]);
  });

  it("says it on the rack, once, for a rack nested in a chain", () => {
    registerArrangementTrack(-2);
    registerRack(RACK, { chains: [{ volume: 1, nestedRack: true }] });
    registerRack(`${RACK} chains 0 devices 0`, {
      id: "inner",
      chains: [{ volume: 1 }],
    });

    const result = readOneDevice({
      path: "t1/d0",
      include: ["chains"],
      maxDepth: 2,
    });
    const inner = innerRackOf(chainsOf(result)[0]);

    expect(result.detail).toBe(UNKNOWN);
    expect(inner).not.toHaveProperty("detail");
    expect(chainsOf(inner)[0]).not.toHaveProperty("automation");
    expect(slotIndexReads()).toBe(1);
  });

  it("flags the chains of a nested rack while the track follows", () => {
    registerArrangementTrack();
    registerRack(RACK, { chains: [{ nestedRack: true }] });
    registerRack(`${RACK} chains 0 devices 0`, {
      id: "inner",
      chains: [{ panning: 1 }],
    });

    const result = readOneDevice({
      path: "t1/d0",
      include: ["chains"],
      maxDepth: 2,
    });
    const inner = innerRackOf(chainsOf(result)[0]);

    expect(chainsOf(inner)[0]?.automation).toStrictEqual(["pan"]);
    expect(slotIndexReads()).toBe(1);
  });

  it("reads a rack on a return track without asking for a clip slot", () => {
    registerArrangementTrack(-2);
    registerRack(RETURN_RACK, { chains: [{ volume: 1 }] });

    const result = readOneDevice({ path: "rt0/d0", include: ["chains"] });

    expect(chainsOf(result)[0]?.automation).toStrictEqual(["gainDb"]);
    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads()).toBe(0);
  });

  it("reads a rack on the main track without asking for a clip slot", () => {
    registerArrangementTrack(-2);
    registerRack(String(livePath.masterTrack().device(0)), {
      chains: [{ panning: 1 }],
    });

    const result = readOneDevice({ path: "mt/d0", include: ["chains"] });

    expect(chainsOf(result)[0]?.automation).toStrictEqual(["pan"]);
    expect(result).not.toHaveProperty("detail");
  });

  describe("a chain read by its own path", () => {
    it("names its fields while the track follows", () => {
      registerArrangementTrack();
      registerRack(RACK, { chains: [{ volume: 1 }] });

      expect(readOneDevice({ path: "t1/d0/c0" }).automation).toStrictEqual([
        "gainDb",
      ]);
    });

    it("says on the chain itself when the track plays from Session", () => {
      registerArrangementTrack(-2);
      registerRack(RACK, { chains: [{ volume: 1 }] });

      const result = readOneDevice({ path: "t1/d0/c0" });

      expect(result).not.toHaveProperty("automation");
      expect(result.detail).toBe(UNKNOWN);
    });

    it("reads a chain by id the same way", () => {
      registerArrangementTrack(-2);
      registerRack(RACK, { chains: [{ volume: 1 }] });

      expect(readOneDevice({ id: "chain-0" }).detail).toBe(UNKNOWN);
    });

    it("tells a rack inside the chain, which then says nothing itself", () => {
      registerArrangementTrack(-2);
      registerRack(RACK, { chains: [{ nestedRack: true }] });
      registerRack(`${RACK} chains 0 devices 0`, {
        id: "inner",
        chains: [{ volume: 1 }],
      });

      const result = readOneDevice({ path: "t1/d0/c0", include: ["chains"] });
      const inner = (result.devices as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >;

      expect(result.detail).toBe(UNKNOWN);
      expect(inner).not.toHaveProperty("detail");
      expect(slotIndexReads()).toBe(1);
    });
  });

  describe("a drum rack", () => {
    it("names the fields of a pad's chains, and says it once on the rack", () => {
      setupKit({ slot: -2 });

      const result = readOneDevice({ path: "t1/d0", include: ["chains"] });
      const pads = result.drumPads as { chains: Record<string, unknown>[] }[];

      expect(pads[0]?.chains[0]).not.toHaveProperty("automation");
      expect(result.detail).toBe(UNKNOWN);

      setupKit({ slot: -1 });

      const followed = readOneDevice({ path: "t1/d0", include: ["chains"] });
      const followedPads = followed.drumPads as {
        chains: Record<string, unknown>[];
      }[];

      expect(followedPads[0]?.chains[0]?.automation).toStrictEqual(["pan"]);
      expect(followed).not.toHaveProperty("detail");
    });

    it("names them at the depth limit too", () => {
      setupKit({ slot: -1 });

      const result = readOneDevice({
        path: "t1/d0",
        include: ["chains"],
        maxDepth: 0,
      });
      const pads = result.drumPads as { chains: Record<string, unknown>[] }[];

      expect(pads[0]?.chains[0]?.automation).toStrictEqual(["pan"]);
    });

    it("says it on a pad read by its own path, not on each chain", () => {
      setupKit({ slot: -2 });

      const result = readOneDevice({ path: "t1/d0/pC1", include: ["chains"] });

      expect(result.detail).toBe(UNKNOWN);
      expect(
        (result.chains as Record<string, unknown>[])[0],
      ).not.toHaveProperty("detail");
    });

    it("names a pad's chain fields while the track follows", () => {
      setupKit({ slot: -1 });

      const result = readOneDevice({ path: "t1/d0/pC1", include: ["chains"] });

      expect(
        (result.chains as Record<string, unknown>[])[0]?.automation,
      ).toStrictEqual(["pan"]);
      expect(result).not.toHaveProperty("detail");
    });

    it("says it on a pad chain read by its own path", () => {
      setupKit({ slot: -2 });

      const result = readOneDevice({ path: "t1/d0/pC1/c0" });

      expect(result).not.toHaveProperty("automation");
      expect(result.detail).toBe(UNKNOWN);
    });

    it("names a pad chain's fields read by its own path", () => {
      setupKit({ slot: -1 });

      expect(readOneDevice({ path: "t1/d0/pC1/c0" }).automation).toStrictEqual([
        "pan",
      ]);
    });

    it("tells a pad with no chain nothing", () => {
      setupKit({ slot: -2, chained: false });

      const result = readOneDevice({ path: "t1/d0/pC1", include: ["chains"] });

      expect(result.chains).toStrictEqual([]);
      expect(result).not.toHaveProperty("detail");
    });
  });
});

interface ChainSetup extends MixerStates {
  noMixer?: boolean;
  nestedRack?: boolean;
}

/**
 * Register a rack with chains, each with a chain mixer, and its return chains.
 * @param path - Live path of the rack
 * @param config - What the rack holds
 * @param config.id - The rack's id
 * @param config.returns - Return chain names, in send order
 * @param config.returnChainStates - Mixer states of each return chain
 * @param config.chains - Each chain's mixer automation states
 */
function registerRack(
  path: string,
  config: {
    id?: string;
    returns?: string[];
    returnChainStates?: MixerStates[];
    chains: ChainSetup[];
  },
): void {
  const { id = "rack", returns = [], returnChainStates = [], chains } = config;
  const chainIds = chains.map((_, i) => `${id === "rack" ? "chain" : id}-${i}`);
  const returnIds = returns.map((_, i) => `${id}-return-${i}`);

  registerMockObject(id, {
    path,
    type: "Device",
    properties: {
      name: "Rack",
      class_display_name: "Instrument Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 0,
      is_active: 1,
      chains: children(...chainIds),
      return_chains: children(...returnIds),
    },
  });

  for (const [i, chain] of chains.entries()) {
    registerChain(chainIds[i] as string, `${path} chains ${i}`, returns, chain);
  }

  for (const [i, name] of returns.entries()) {
    registerChain(
      returnIds[i] as string,
      `${path} return_chains ${i}`,
      returns,
      returnChainStates[i] ?? {},
      name,
    );
  }
}

/**
 * Register one chain with a mixer.
 * @param id - The chain's id
 * @param path - Live path of the chain
 * @param returns - The rack's return chain names, one send each
 * @param states - The mixer parameters' automation states
 * @param name - The chain's name
 */
function registerChain(
  id: string,
  path: string,
  returns: string[],
  states: ChainSetup,
  name = "Chain",
): void {
  registerMockObject(id, {
    path,
    type: "Chain",
    properties: {
      name,
      mute: 0,
      solo: 0,
      muted_via_solo: 0,
      // A nested rack is registered by the test, as the chain's first device.
      devices: states.nestedRack ? children("inner") : [],
    },
  });

  if (states.noMixer) {
    return;
  }

  const mixer = `${path} mixer_device`;
  const sendIds = returns.map((_, i) => `${id}-send-${i}`);

  registerMockObject(`${id}-mixer`, {
    path: mixer,
    type: "ChainMixerDevice",
    properties: { sends: children(...sendIds) },
  });
  registerMockObject(`${id}-volume`, {
    path: `${mixer} volume`,
    type: "DeviceParameter",
    properties: {
      display_value: states.gainDb ?? 0,
      automation_state: states.volume ?? 0,
    },
  });
  registerMockObject(`${id}-panning`, {
    path: `${mixer} panning`,
    type: "DeviceParameter",
    properties: { value: 0, automation_state: states.panning ?? 0 },
  });

  for (const [i, sendId] of sendIds.entries()) {
    registerMockObject(sendId, {
      path: `${mixer} sends ${i}`,
      type: "DeviceParameter",
      properties: {
        value: 0,
        display_value: -70,
        automation_state: states.sends?.[i] ?? 0,
      },
    });
  }
}

/**
 * A Drum Rack with a C1 pad holding one chain whose pan has a lane.
 * @param config - The setup
 * @param config.slot - The track's playing_slot_index
 * @param config.chained - Whether the pad holds the chain
 */
function setupKit({
  slot,
  chained = true,
}: {
  slot: number;
  chained?: boolean;
}): void {
  setupDrumPadMocks({
    padIds: ["pad-36"],
    padProperties: {
      "pad-36": { note: 36, name: "Kick", chainIds: chained ? ["dc"] : [] },
    },
    chainProperties: { dc: { name: "Kick", deviceIds: [] } },
    rackProperties: {
      name: "Kit",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      is_active: 1,
    },
  });
  registerArrangementTrack(slot);

  const mixer = `${RACK} chains 0 mixer_device`;

  registerMockObject("dc-mixer", {
    path: mixer,
    type: "ChainMixerDevice",
    properties: { sends: [] },
  });
  registerMockObject("dc-volume", {
    path: `${mixer} volume`,
    type: "DeviceParameter",
    properties: { display_value: 0, automation_state: 0 },
  });
  registerMockObject("dc-panning", {
    path: `${mixer} panning`,
    type: "DeviceParameter",
    properties: { value: 0, automation_state: 1 },
  });
}

/**
 * The rack read as the first device of a chain.
 * @param chain - A chain entry
 * @returns The rack's entry
 */
function innerRackOf(
  chain: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return (chain!.devices as Record<string, unknown>[])[0]!;
}

/**
 * The chains of a device entry.
 * @param result - A device entry
 * @returns Its chain entries
 */
function chainsOf(result: Record<string, unknown>): Record<string, unknown>[] {
  return result.chains as Record<string, unknown>[];
}

/**
 * How many times the track was asked for its playing_slot_index.
 * @returns Number of reads
 */
function slotIndexReads(): number {
  const track = lookupMockObject("arrangement-track");

  return (
    track?.get.mock.calls.filter(([name]) => name === "playing_slot_index")
      .length ?? 0
  );
}
