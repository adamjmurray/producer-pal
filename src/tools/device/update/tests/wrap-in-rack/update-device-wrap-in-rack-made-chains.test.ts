// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A toPath can make rack chains on the way to the slot. The wrap reports them,
// and a failed wrap names them, since they stay in the Set either way.

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  followMoves,
  registerAudioEffectDevice,
  registerGrowingChainRack,
  registerInstrumentDevice,
  registerTempTrackMocks,
  registerTrackingChain,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";

const DEST_RACK = livePath.track(2).device(0);

/**
 * Register a rack with no chains on track 2. Each insert_chain adds a chain,
 * and a chain takes (or, when it refuses, turns down) the new wrap rack.
 * @param accepts - Whether its chains take an insert_device
 */
function registerDestinationRack(accepts: boolean): void {
  const chainIds: string[] = [];

  registerMockObject("track-2", { path: livePath.track(2) });
  registerMockObject("dest-rack", {
    path: DEST_RACK,
    type: "RackDevice",
    properties: { chains: chainIds, can_have_chains: 1, can_have_drum_pads: 0 },
    methods: {
      insert_chain: () => {
        const index = chainIds.length / 2;
        const id = `dest-chain-${index}`;

        registerMockObject(id, {
          path: DEST_RACK.chain(index),
          type: "Chain",
          properties: { devices: children() },
          methods: {
            insert_device: () => (accepts ? ["id", "new-rack"] : ["id", "0"]),
          },
        });
        chainIds.push("id", id);

        return ["id", id];
      },
    },
  });
}

describe("updateDevice - wrapInRack with chains made by toPath", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    mockNonExistentObjects();
    registerAudioEffectDevice("device-0", 0);
    registerTrack0();
    liveSet = registerMockObject("live-set", { path: "live_set" });
    registerTrackingChain(liveSet);
    registerGrowingChainRack(1);
  });

  it("reports the chains toPath made on the rack's entry", () => {
    registerDestinationRack(true);

    expect(
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t2/d0/c2/d+" }),
    ).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 1,
      created: "c0-c2",
    });
  });

  it("names them when Live then refuses the rack", () => {
    registerDestinationRack(false);

    expect(() =>
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t2/d0/c2/d+" }),
    ).toThrow(
      "wrapInRack: Live refused to insert the Audio Effect Rack; left 3 empty chains: c0-c2",
    );
  });

  it("names the chain a c+ made, which the path reports as its own", () => {
    registerDestinationRack(false);

    expect(() =>
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t2/d0/c+" }),
    ).toThrow(
      "wrapInRack: Live refused to insert the Audio Effect Rack; left an empty chain: c0",
    );
  });

  it("names them when an instrument wrap fails, beside what it undid", () => {
    registerInstrumentDevice("device-3", 3);
    registerDestinationRack(false);
    registerTempTrackMocks();

    expect(() =>
      updateDevice({ path: "t0/d3", wrapInRack: true, toPath: "t2/d0/c+" }),
    ).toThrow(
      "wrapInRack: Live refused to insert the Instrument Rack; left an empty chain: c0",
    );
  });

  it("says nothing of chains when toPath made none", () => {
    registerMockObject("track-2", {
      path: livePath.track(2),
      methods: { insert_device: () => ["id", "0"] },
    });

    expect(() =>
      updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t2" }),
    ).toThrow(/Live refused to insert the Audio Effect Rack$/);
  });
});

// toPath names a slot in the container as it was before the call. The
// instrument has left it by the time the rack goes in, so the slot after the
// instrument is one lower, and the container's own end is its end.
describe("updateDevice - wrapInRack of an instrument to its own container", () => {
  let track0: RegisteredMockObject;

  beforeEach(() => {
    mockNonExistentObjects();
    track0 = registerTrack0();
    registerInstrumentDevice("synth", 0);
    registerAudioEffectDevice("reverb", 1);
    registerGrowingChainRack(0);

    const liveSet = registerTempTrackMocks();

    registerTrackingChain(liveSet);
    followMoves(liveSet, track0, undefined, ["synth", "reverb"]);
  });

  it("appends the rack for the slot past the container's last device", () => {
    updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t0/d2" });

    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Instrument Rack",
    );
  });

  it("puts the rack ahead of the effect for the slot between them", () => {
    updateDevice({ path: "t0/d0", wrapInRack: true, toPath: "t0/d1" });

    expect(track0.call).toHaveBeenCalledWith(
      "insert_device",
      "Instrument Rack",
      0,
    );
  });
});
