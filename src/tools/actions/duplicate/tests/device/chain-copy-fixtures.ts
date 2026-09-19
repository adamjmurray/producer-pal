// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Mock layouts shared by the chain-copy tests. Copying a chain makes the chain,
// then carries the source's devices across from a temp track copy, so every one
// of them needs the same live_set, rack and source chain.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** The rack under test. */
export const CHAIN_COPY_RACK = livePath.track(0).device(0);

/**
 * Register the live_set the carry runs on: duplicate_track parks a copy of
 * track 0 at track 1, the devices move out of it, and it is deleted after.
 * @returns The live_set mock
 */
export function registerCarryLiveSet(): RegisteredMockObject {
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

  return liveSet;
}

export interface SourceRackFixture {
  /** The rack's Live class, which decides what kind of chain it takes */
  className?: string;
  hasMacroMappings?: number;
  /** Chains the rack lists, for a test that reads the list back */
  chainIds?: string[];
}

/**
 * Register the rack whose chain gets copied. Its insert_chain hands back
 * "chain-new", the way Live hands back the chain it just made.
 * @param fixture - What the rack reports
 * @returns The rack mock
 */
export function registerSourceRack(
  fixture: SourceRackFixture = {},
): RegisteredMockObject {
  const properties: Record<string, unknown> = {
    class_name: fixture.className ?? "InstrumentGroupDevice",
    has_macro_mappings: fixture.hasMacroMappings ?? 0,
    return_chains: [],
  };

  if (fixture.chainIds != null) {
    properties.chains = children(...fixture.chainIds);
  }

  return registerMockObject("rack-0", {
    path: CHAIN_COPY_RACK,
    type: "RackDevice",
    properties,
    methods: { insert_chain: () => ["id", "chain-new"] },
  });
}

/**
 * Register the chain being copied, named "Source" and holding `deviceIds`.
 * @param deviceIds - The devices already on it
 * @returns The chain mock
 */
export function registerSourceChain(
  deviceIds: string[] = [],
): RegisteredMockObject {
  return registerMockObject("chain-0", {
    path: `${CHAIN_COPY_RACK} chains 0`,
    type: "Chain",
    properties: {
      name: "Source",
      mute: 0,
      solo: 0,
      devices: children(...deviceIds),
    },
  });
}
