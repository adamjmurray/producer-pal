// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A rack whose insert_chain adds a chain, shared by the tests of paths that
// make chains on the way.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  type RegisteredMockObjectOptions,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

export interface GrowingRackFixture {
  /** Track the rack sits on, as the device 0 of it */
  track: number;
  /** How many chains the rack starts with */
  existing: number;
  /** Methods on every chain, e.g. one that turns down an insert */
  chainMethods?: RegisteredMockObjectOptions["methods"];
}

/**
 * Register a rack as device 0 of a track, whose insert_chain appends a chain
 * that can take a device. Chains register as `chain-<n>`, the rack as `rack`.
 * @param fixture - Where the rack is and how it starts
 * @returns The rack mock
 */
export function registerGrowingRack(
  fixture: GrowingRackFixture,
): RegisteredMockObject {
  const rackPath = livePath.track(fixture.track).device(0);
  const chainIds: string[] = [];

  const addChain = (): string => {
    const index = chainIds.length / 2;
    const id = `chain-${index}`;

    registerMockObject(id, {
      path: rackPath.chain(index),
      type: "Chain",
      properties: { devices: children() },
      ...(fixture.chainMethods ? { methods: fixture.chainMethods } : {}),
    });
    chainIds.push("id", id);

    return id;
  };

  for (let i = 0; i < fixture.existing; i++) {
    addChain();
  }

  return registerMockObject("rack", {
    path: rackPath,
    type: "RackDevice",
    properties: { chains: chainIds, can_have_chains: 1, can_have_drum_pads: 0 },
    methods: { insert_chain: () => ["id", addChain()] },
  });
}

/**
 * Register a track with a source device (`src-0`) and a track holding a rack
 * (`rack`), for moves into the rack.
 */
export function registerMoveSourceAndRackTrack(): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    type: "Track",
    properties: { devices: children("src-0") },
  });
  registerMockObject("track-1", {
    path: livePath.track(1),
    type: "Track",
    properties: { devices: children("rack") },
  });
  registerMockObject("src-0", {
    path: livePath.track(0).device(0),
    type: "Device",
  });
}
