// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Pad C1 holds two layers and pad D1 one, so the rack's two chain numberings
// disagree: pC1/c0 and pC1/c1 are chains 0 and 2, and pD1/c0 is chain 1.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  children,
  livePath,
  mockWorkingDeviceMoves,
  registerMockObject,
  updateDevice,
  writesThroughSets,
} from "../update-device-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

/** in_note per rack chain: C1 (36) layered twice, D1 (38) once. */
const CHAIN_NOTES = [36, 38, 36];

describe("updateDevice — drum chain path spelling", () => {
  beforeEach(() => {
    registerMockObject("track-0", { path: livePath.track(0) });
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        chains: children("chain-0", "chain-1", "chain-2"),
        can_have_drum_pads: 1,
      },
    });

    for (const [index, inNote] of CHAIN_NOTES.entries()) {
      registerMockObject(`chain-${index}`, {
        path: livePath.track(0).device(0).chain(index),
        type: "DrumChain",
        properties: { in_note: inNote, devices: children(`dev-${index}`) },
      });
      registerMockObject(`dev-${index}`, {
        path: livePath.track(0).device(0).chain(index).device(0),
        type: "PluginDevice",
      });
    }
  });

  it("echoes the pad spelling the call supplied", () => {
    expect(
      updateDevice({ path: "t0/d0/pC1/c1/d0", name: "Kick" }),
    ).toStrictEqual({ id: "dev-2", path: "t0/d0/pC1/c1/d0" });
  });

  it("echoes the rack-relative spelling the call supplied", () => {
    expect(updateDevice({ path: "t0/d0/c2/d0", name: "Kick" })).toStrictEqual({
      id: "dev-2",
      path: "t0/d0/c2/d0",
    });
  });

  // The two numberings disagree here: rack chain 1 is pD1's only layer, where
  // pC1/c1 is rack chain 2. A result that swapped spellings would send a
  // follow-up call to the wrong pad.
  it("names different chains for c1 and pC1/c1", () => {
    expect(updateDevice({ path: "t0/d0/c1/d0", name: "Snare" })).toStrictEqual({
      id: "dev-1",
      path: "t0/d0/c1/d0",
    });
    expect(
      updateDevice({ path: "t0/d0/pD1/c0/d0", name: "Snare" }),
    ).toStrictEqual({ id: "dev-1", path: "t0/d0/pD1/c0/d0" });
  });

  it("spells a pad's first layer through the pad it was written with", () => {
    expect(updateDevice({ path: "t0/d0/pC1/d0", name: "Kick" })).toStrictEqual({
      id: "dev-0",
      path: "t0/d0/pC1/d0",
    });
  });

  // A chain's container is the rack, not the pad the path spells it through, so
  // the pad half is never grafted onto the front of the chain's own segments.
  it("leaves a chain path alone", () => {
    expect(updateDevice({ path: "t0/d0/pC1/c0", name: "Kick" })).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/pC1/c0",
    });
  });

  // An id-addressed call spelled no container, so nothing is echoed and the
  // path is derived as it always was.
  it("keeps the derived spelling for a call that named no path", () => {
    expect(updateDevice({ id: "dev-2", name: "Kick" })).toStrictEqual({
      id: "dev-2",
      path: "t0/d0/c2/d0",
    });
  });

  it("leaves a device outside a drum rack alone", () => {
    registerMockObject("track-1", { path: livePath.track(1) });
    registerMockObject("plain-dev", {
      path: livePath.track(1).device(0),
      type: "PluginDevice",
    });

    expect(updateDevice({ path: "t1/d0", name: "Reverb" })).toStrictEqual({
      id: "plain-dev",
      path: "t1/d0",
    });
  });

  // The pad the call named is empty once its only chain leaves it, so the
  // container spelling resolves to nothing and there is nothing to echo. Two
  // ways a pad comes up empty: with a DrumPad object still on it, and without.
  function moveTheOnlyChainOffPadC1(...padIds: string[]): unknown {
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        chains: children("chain-0"),
        can_have_drum_pads: 1,
        drum_pads: children(...padIds),
      },
    });
    registerMockObject("pad-36", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });
    writesThroughSets(
      registerMockObject("chain-0", {
        path: livePath.track(0).device(0).chain(0),
        type: "DrumChain",
        properties: { in_note: 36, devices: children() },
      }),
    );

    return updateDevice({ path: "t0/d0/pC1/c0", toPath: "t0/d0/pD1" });
  }

  it("derives the path when the pad the call named kept its object", () => {
    expect(moveTheOnlyChainOffPadC1("pad-36")).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/pD1/c0",
    });
  });

  it("derives the path when the pad the call named is gone entirely", () => {
    expect(moveTheOnlyChainOffPadC1()).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/pD1/c0",
    });
  });

  // A kit inside a pad has no pads of its own, so this rack is reachable only
  // through the outer pad — and the inner pad path resolves to a chain, which
  // is why a whole-pad result never has to echo anything.
  it("echoes both pad spellings down a nested kit", () => {
    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36, devices: children("inner-rack") },
    });
    registerMockObject("inner-rack", {
      path: livePath.track(0).device(0).chain(0).device(0),
      type: "RackDevice",
      properties: {
        chains: children("inner-chain"),
        can_have_drum_pads: 1,
        drum_pads: [],
      },
    });
    registerMockObject("inner-chain", {
      path: livePath.track(0).device(0).chain(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 38, devices: children() },
    });

    expect(
      updateDevice({ path: "t0/d0/pC1/d0/pD1", mute: true }),
    ).toStrictEqual({ id: "inner-chain", path: "t0/d0/pC1/d0/pD1/c0" });
  });

  // The move really happens here: Live re-parents the device and the mock
  // re-paths it, so the result is named from where it actually landed. The
  // chain already holds a device, so /d0 is only right if the toPath's position
  // was honoured rather than appended past it.
  it("spells a moved device through the pad path the toPath named", () => {
    mockWorkingDeviceMoves();
    registerMockObject("track-1", { path: livePath.track(1) });
    registerMockObject("plain-dev", {
      path: livePath.track(1).device(0),
      type: "PluginDevice",
    });

    expect(
      updateDevice({ path: "t1/d0", toPath: "t0/d0/pC1/c1/d0" }),
    ).toStrictEqual({ id: "plain-dev", path: "t0/d0/pC1/c1/d0" });

    // The device it displaced answers with the index it shifted to.
    expect(updateDevice({ id: "dev-2" })).toStrictEqual({
      id: "dev-2",
      path: "t0/d0/c2/d1",
    });
  });
});
