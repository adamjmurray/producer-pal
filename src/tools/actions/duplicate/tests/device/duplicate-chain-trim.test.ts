// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Copying a chain writes the source's fader onto the copy, then carries its
// devices across from a temp track. Nothing below duplicate() is mocked here,
// so the real device move runs — which is where the trim used to be reported as
// left behind, naming the temp chain it had just read it off. The other chain
// suites mock the move away, so this is the only place the two halves meet.

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";

const RACK = livePath.track(0).device(0);
const SOURCE_CHAIN = `${RACK} chains 0`;
const COPY_CHAIN = `${RACK} chains 1`;
// duplicate_track parks a copy of track 0 at track 1 for the carry.
const TEMP_CHAIN = `${livePath.track(1).device(0)} chains 0`;

const GAIN_DB = -2;
const PAN = 0.25;
/** The pad both drum chains sound on, so the copy is C1's second layer. */
const PAD_NOTE = 36;

type RackKind = "instrument" | "drum";

/**
 * Register a chain's mixer device and its two faders.
 * @param prefix - Mock id prefix, so each chain's mixer is its own object
 * @param chainPath - The chain's Live API path
 * @param trimmed - Whether the faders sit off their defaults
 * @returns The volume and panning mocks
 */
function registerMixer(prefix: string, chainPath: string, trimmed: boolean) {
  registerMockObject(`${prefix}-mixer`, { path: `${chainPath} mixer_device` });

  return {
    volume: registerMockObject(`${prefix}-volume`, {
      path: `${chainPath} mixer_device volume`,
      properties: trimmed ? { display_value: GAIN_DB } : {},
    }),
    panning: registerMockObject(`${prefix}-panning`, {
      path: `${chainPath} mixer_device panning`,
      properties: trimmed ? { value: PAN } : {},
    }),
  };
}

/**
 * Register the rack the copy is made in, plus the pad a Drum Rack needs to
 * resolve its chains by note.
 * @param kind - Which rack the chains live in
 */
function registerRack(kind: RackKind): void {
  const drum = kind === "drum";

  registerMockObject("rack-0", {
    path: RACK,
    type: "RackDevice",
    properties: {
      class_name: drum ? "DrumGroupDevice" : "InstrumentGroupDevice",
      has_macro_mappings: 0,
      return_chains: [],
      chains: children("chain-0", "chain-new"),
      ...(drum
        ? { can_have_drum_pads: 1, drum_pads: children("pad-36") }
        : { can_have_drum_pads: 0 }),
    },
    methods: { insert_chain: () => ["id", "chain-new"] },
  });

  if (drum) {
    registerMockObject("pad-36", {
      path: livePath.track(0).device(0).drumPad(PAD_NOTE),
      type: "DrumPad",
      properties: { note: PAD_NOTE },
    });
  }
}

/**
 * A rack whose first chain is trimmed and holds one device, plus the temp track
 * copy the carry takes that device from.
 * @param kind - Which rack the chains live in
 * @returns The live_set mock and the copy's faders
 */
function setupTrimmedChain(kind: RackKind) {
  const drum = kind === "drum";
  const chainType = drum ? "DrumChain" : "Chain";
  // The copy's in_note is registered rather than written: set() is a spy, and
  // the pad spelling of the destination path is read back off this.
  const pad = drum ? { in_note: PAD_NOTE } : {};

  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children("track-0") },
    methods: {
      duplicate_track: () => null,
      delete_track: () => null,
      move_device: () => null,
    },
  });

  registerMockObject("track-0", { path: livePath.track(0) });
  registerRack(kind);

  registerMockObject("chain-0", {
    path: SOURCE_CHAIN,
    type: chainType,
    properties: {
      name: "Chain",
      mute: 0,
      solo: 0,
      ...pad,
      devices: children("src-dev"),
    },
  });
  registerMixer("source", SOURCE_CHAIN, true);
  registerMockObject("src-dev", { path: `${SOURCE_CHAIN} devices 0` });

  // Lists the moved device, so the move reads back as landed.
  registerMockObject("chain-new", {
    path: COPY_CHAIN,
    type: chainType,
    properties: {
      name: "",
      mute: 0,
      solo: 0,
      ...pad,
      devices: children("temp-dev"),
    },
  });

  // The temp track's copy of the source chain, trim and all: the chain a move
  // reading a source off the temp device would find, and name.
  registerMockObject("temp-chain", {
    path: TEMP_CHAIN,
    type: chainType,
    properties: { name: "Chain", ...pad, devices: children("temp-dev") },
  });
  registerMixer("temp", TEMP_CHAIN, true);
  registerMockObject("temp-dev", { path: `${TEMP_CHAIN} devices 0` });

  return { liveSet, copy: registerMixer("copy", COPY_CHAIN, false) };
}

/**
 * Copy the rack's one chain, and check its trim reached the copy ahead of its
 * device with nothing said about staying behind.
 * @param kind - Which rack the chains live in
 * @param expectedPath - The path the copy comes back spelled as
 */
async function expectTrimCarried(
  kind: RackKind,
  expectedPath: string,
): Promise<void> {
  const { liveSet, copy } = setupTrimmedChain(kind);

  const result = await duplicate({ type: "chain", id: "chain-0" });

  expect(result).toStrictEqual({ id: "chain-new", path: expectedPath });
  expect(copy.volume.set).toHaveBeenCalledWith("display_value", GAIN_DB);
  expect(copy.panning.set).toHaveBeenCalledWith("value", PAN);

  // The device really crossed, so the trim is not sitting on an empty copy.
  expect(liveSet.call).toHaveBeenCalledWith(
    "move_device",
    "id temp-dev",
    "id chain-new",
    0,
  );

  // The trim landed before the devices arrived. Warning that it stayed behind
  // would be false, and would name the temp chain the move read it off.
  expect(capturedWarnings()).toStrictEqual([]);
}

describe("duplicate - chain trim", () => {
  it("carries the trim to the copy and says nothing about leaving it behind", async () => {
    await expectTrimCarried("instrument", "t0/d0/c1");
  });

  // A drum chain is addressed by its pad, so the carry moves the device to
  // "pC1/c1/d0" — a destination the instrument case never builds, and the one
  // shape of this path nothing covered.
  it("carries a drum chain's trim, moving its device by the pad path", async () => {
    await expectTrimCarried("drum", "t0/d0/pC1/c1");
  });
});
