// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Drum Racks whose pads take a `sample` write, for the update-device tests.

import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
} from "../../update-device-test-helpers.ts";

/** The id Live hands back for the Simpler a pad chain auto-creates. */
const SIMPLER_ID = "new-simpler";

/**
 * Register a Drum Rack at t0/d0 with a single C1 (MIDI 36) pad chain holding
 * `deviceIds`, whose device slot auto-creates a Simpler on insert.
 * @param deviceIds - Ids of the devices already on the pad
 * @returns The C1 chain mock
 */
export function registerDrumRackWithC1(
  ...deviceIds: string[]
): RegisteredMockObject {
  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
  });

  const chain = registerMockObject("chain-c1", {
    type: "DrumChain",
    properties: { in_note: 36, devices: children(...deviceIds) },
    methods: { insert_device: () => ["id", SIMPLER_ID] },
  });

  registerCreatedSimpler();

  return chain;
}

/**
 * Register a Drum Rack at t0/d0 whose C1 pad already holds a DrumSampler.
 * @returns The C1 chain mock
 */
export function registerDrumRackWithDrumSamplerOnC1(): RegisteredMockObject {
  const chain = registerDrumRackWithC1("ds-1");

  registerMockObject("ds-1", {
    type: "Device",
    properties: {
      class_display_name: "DrumSampler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });

  return chain;
}

export const KICK = "/Library/kick.wav";

/**
 * Register a Drum Rack on t0/d0 whose C1 pad holds `layers` chains, each
 * empty and ready to auto-create a Simpler.
 * @param layers - How many chains sit on the pad
 * @returns The pad's chains, in rack order
 */
export function registerPadRack(layers = 1): RegisteredMockObject[] {
  const chainIds = Array.from({ length: layers }, (_, i) => `chain-${i}`);

  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children(...chainIds),
      drum_pads: children("pad-36"),
    },
  });
  registerMockObject("pad-36", {
    path: livePath.track(0).device(0).drumPad(36),
    type: "DrumPad",
    properties: { note: 36 },
  });

  return chainIds.map((id, index) => {
    const chain = registerMockObject(id, {
      path: livePath.track(0).device(0).chain(index),
      type: "DrumChain",
      properties: { in_note: 36, devices: children() },
      methods: {
        // The chain holds what Live inserted, so a read-back sees it.
        insert_device: () => {
          chain.properties.devices = children(SIMPLER_ID);

          return ["id", SIMPLER_ID];
        },
      },
    });

    return chain;
  });
}

/**
 * The same rack with the pad's chains not made yet. `insert_chain` hands each
 * back the way Live does: appended to the rack, its note set afterwards.
 * @param layers - How many chains `insert_chain` can make
 * @returns The rack mock
 */
export function registerUnbuiltPadChain(layers = 1): RegisteredMockObject {
  const built: string[] = [];

  registerPadRack(layers);
  registerCreatedSimpler(layers - 1);

  // A re-registration replaces the property bag, so this restates the rack.
  const rack = registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children(),
      drum_pads: children("pad-36"),
    },
    methods: {
      insert_chain: () => {
        built.push(`chain-${built.length}`);
        rack.properties.chains = children(...built);

        return null;
      },
    },
  });

  return rack;
}

/**
 * Make a pad chain answer `insert_device` with no id, as Live does when it
 * refuses the insert.
 * @param index - Which of the pad's chains
 */
export function registerChainInsertingNothing(index = 0): void {
  registerMockObject(`chain-${index}`, {
    path: livePath.track(0).device(0).chain(index),
    type: "DrumChain",
    properties: { in_note: 36, devices: children() },
    methods: { insert_device: () => null },
  });
}

/**
 * Register the Simpler a pad chain auto-creates, with a sample that reads back
 * whatever `replace_sample` was handed.
 * @param chainIndex - Which layer it lands in
 * @returns The Simpler mock
 */
export function registerCreatedSimpler(chainIndex = 0): RegisteredMockObject {
  const sample = registerMockObject("new-sample", {
    type: "Sample",
    properties: { file_path: "", gain: 0.5 },
  });
  const simpler = registerMockObject(SIMPLER_ID, {
    path: livePath.track(0).device(0).chain(chainIndex).device(0),
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      sample: children("new-sample"),
    },
  });

  simpler.call.mockImplementation((method: string, value: unknown) => {
    if (method === "replace_sample") {
      sample.properties.file_path = value;
    }
  });

  return simpler;
}

/**
 * Put an instrument whose sample can't be set on a pad layer.
 * @param chain - The layer's chain mock
 * @param chainIndex - Its index in the rack
 * @returns The instrument mock
 */
export function registerDrumSamplerOn(
  chain: RegisteredMockObject,
  chainIndex = 0,
): RegisteredMockObject {
  chain.properties.devices = children("ds-1");

  return registerMockObject("ds-1", {
    path: livePath.track(0).device(0).chain(chainIndex).device(0),
    type: "Device",
    properties: {
      class_display_name: "Drum Sampler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });
}
