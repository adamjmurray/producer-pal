// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";

interface InstrumentRackFixtureOptions {
  chainCount: number;
  chainDeviceIds?: (chainIndex: number) => string[];
}

/**
 * Register an instrument rack with no drum rack in it as device 0 of track 0 —
 * the shape a drum-mode walk recurses all of and finds nothing in. Chains are
 * registered as `rackChain<i>`, so a build budget counts walks with
 * `resolves("id rackChain*")`.
 * @param options - Fixture options
 * @param options.chainCount - How many chains the rack carries
 * @param options.chainDeviceIds - Device ids to list on a chain; chains are
 *   empty without it. The devices themselves are the caller's to register.
 * @returns The chain ids, in order
 */
export function registerInstrumentRackFixture({
  chainCount,
  chainDeviceIds,
}: InstrumentRackFixtureOptions): string[] {
  const chainIds = Array.from(
    { length: chainCount },
    (_, i) => `rackChain${String(i)}`,
  );

  registerMockObject("instrumentRack", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      can_have_chains: 1,
      can_have_drum_pads: 0,
      class_name: "InstrumentGroupDevice",
      chains: children(...chainIds),
      return_chains: [],
    },
  });

  for (const [i, chainId] of chainIds.entries()) {
    registerMockObject(chainId, {
      path: livePath.track(0).device(0).chain(i),
      type: "Chain",
      properties: {
        name: `Chain ${String(i)}`,
        devices: children(...(chainDeviceIds?.(i) ?? [])),
      },
    });
  }

  return chainIds;
}
