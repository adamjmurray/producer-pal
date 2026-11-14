// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Racks for the tests of tools that add chains: Live 13's fixed-chain racks
// (Mid-Side, Multiband), and what Live 12 answers when asked for the limit
// those racks report.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerGrowingRack } from "./growing-rack-fixtures.ts";

/** The fixed chains each Live 13 rack has. */
export const FIXED_RACKS = {
  midSide: {
    className: "AudioEffectMidSideGroupDevice",
    name: "Mid-Side Rack",
    chains: ["Mid", "Side"],
  },
  multiband: {
    className: "AudioEffectMultibandGroupDevice",
    name: "Multiband Rack",
    chains: ["Low", "Mid", "High"],
  },
} as const;

const NEW_DEVICE = "new-device";

export type FixedRackKind = keyof typeof FIXED_RACKS;

/**
 * Report a Live version from live_app.
 * @param version - What `get_version_string` returns
 */
export function liveVersion(version: string): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => version },
  });
}

/**
 * Register a Live 13 fixed-chain rack as device 0 of a track. It reads
 * `max_num_chains` as its chain count, and its insert_chain adds nothing and
 * answers 1, as Live's does. Chains register as `chain-<n>`; chain 0 takes a
 * device.
 * @param track - The track the rack sits on
 * @param kind - Which rack
 * @returns The rack mock
 */
export function registerFixedChainRack(
  track: number,
  kind: FixedRackKind,
): RegisteredMockObject {
  const { className, name, chains } = FIXED_RACKS[kind];
  const rackPath = livePath.track(track).device(0);

  liveVersion("13.0b25");
  registerMockObject(`track-${track}`, {
    path: livePath.track(track),
    type: "Track",
    properties: { devices: children("rack") },
  });

  const chainIds = chains.flatMap((_, index) => ["id", `chain-${index}`]);

  for (const [index, chainName] of chains.entries()) {
    registerMockObject(`chain-${index}`, {
      path: rackPath.chain(index),
      type: "Chain",
      properties: { name: chainName, devices: children() },
      methods: { insert_device: () => ["id", NEW_DEVICE] },
    });
  }

  registerMockObject(NEW_DEVICE, {
    path: rackPath.chain(0).device(0),
    type: "Device",
  });

  return registerMockObject("rack", {
    path: rackPath,
    type: "RackDevice",
    properties: {
      name,
      class_name: className,
      type: 2,
      chains: chainIds,
      can_have_chains: 1,
      can_have_drum_pads: 0,
      max_num_chains: chains.length,
    },
    methods: { insert_chain: () => 1 },
  });
}

interface LiveRackOptions {
  inserted?: string;
  chainIdPrefix?: string;
}

/**
 * Register an ordinary rack on Live 12, asked for `max_num_chains`, which Live
 * 12 doesn't have. Max answers an unknown property with a bare 1, which reads
 * as a limit of 1 on a rack that already has chains. Its insert_chain works, and
 * a device inserted into any chain lands as `new-device`.
 * @param track - The track the rack sits on
 * @param existing - How many chains the rack starts with
 * @param answer - What the unknown property reads as: the bare number, or a
 *   one-element list
 * @param options - Optional changes
 * @param options.inserted - The id a device inserted into a chain answers with.
 *   The default one is registered at the rack's next chain; any other the test
 *   has registered itself
 * @param options.chainIdPrefix - What the rack's chain ids start with
 * @returns The rack mock
 */
export function registerLive12Rack(
  track: number,
  existing: number,
  answer: number | [number] = 1,
  { inserted = NEW_DEVICE, chainIdPrefix }: LiveRackOptions = {},
): RegisteredMockObject {
  liveVersion("12.4.3");
  registerMockObject(`track-${track}`, {
    path: livePath.track(track),
    type: "Track",
  });

  const rack = registerGrowingRack({
    track,
    existing,
    chainIdPrefix,
    chainMethods: { insert_device: () => ["id", inserted] },
  });

  // The device a `c+` loads goes in the chain that rack makes next.
  if (inserted === NEW_DEVICE) {
    registerMockObject(NEW_DEVICE, {
      path: livePath.track(track).device(0).chain(existing).device(0),
      type: "Device",
    });
  }

  const read = rack.get.getMockImplementation() as (
    property: string,
  ) => unknown;

  rack.get.mockImplementation((property: string) =>
    property === "max_num_chains" ? answer : read(property),
  );

  return rack;
}
