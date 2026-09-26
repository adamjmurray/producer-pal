// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Rack and drum-kit mock layouts shared by the device build-budget tests.
// Each tool's test still owns its counts and assertions; only the fixture is
// shared.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObjectOptions,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** Note of a drum rack's first pad, the one Live puts at C1. */
export const FIRST_PAD_NOTE = 36;

/** How many pads Live gives a drum rack, whatever the kit holds. */
const DRUM_RACK_PADS = 128;

/** Per-chain mock options, on top of the path the fixture already sets. */
type ChainOptions = (
  index: number,
) => Omit<RegisteredMockObjectOptions, "path">;

export interface ChainRackFixture {
  /** Track the rack sits on; the track registers as `track-<index>` */
  trackIndex: number;
  /** Mock id for the rack device */
  rackId: string;
  /** Mock id for each chain, in order */
  chainIds: string[];
  /** Methods the track itself answers, such as `insert_device` */
  trackMethods?: Record<string, (...args: unknown[]) => unknown>;
  /** Extra options for each chain */
  chainOptions?: ChainOptions;
}

/**
 * Register a track holding one plain rack of named chains.
 * @param fixture - What the rack is made of
 */
export function registerChainRack(fixture: ChainRackFixture): void {
  const { trackIndex, rackId, chainIds } = fixture;

  registerMockObject(`track-${String(trackIndex)}`, {
    path: livePath.track(trackIndex),
    properties: { devices: children(rackId) },
    methods: fixture.trackMethods,
  });
  registerMockObject(rackId, {
    path: livePath.track(trackIndex).device(0),
    properties: {
      chains: children(...chainIds),
      can_have_chains: 1,
      can_have_drum_pads: 0,
    },
  });

  for (const [index, chainId] of chainIds.entries()) {
    registerMockObject(chainId, {
      path: livePath.track(trackIndex).device(0).chain(index),
      ...fixture.chainOptions?.(index),
    });
  }
}

export interface DrumKitFixture {
  /** Track the kit sits on; the track registers as `track-<index>` */
  trackIndex: number;
  /** Mock id for the drum rack */
  kitId: string;
  /** Mock ids for the pads are this prefix plus the pad's note number */
  padIdPrefix: string;
  /** Mock id for each chain, in order; chain i answers to pad note 36 + 2i */
  chainIds: string[];
  /** Extra options for each chain */
  chainOptions?: ChainOptions;
}

/**
 * Register a track holding a Drum Rack whose pads each carry one chain.
 * @param fixture - What the kit is made of
 */
export function registerDrumKit(fixture: DrumKitFixture): void {
  const { trackIndex, kitId, padIdPrefix, chainIds } = fixture;
  const kitPath = livePath.track(trackIndex).device(0);
  const padIds = Array.from(
    { length: DRUM_RACK_PADS },
    (_, note) => `${padIdPrefix}${String(note)}`,
  );

  registerMockObject(`track-${String(trackIndex)}`, {
    path: livePath.track(trackIndex),
    properties: { devices: children(kitId) },
  });
  registerMockObject(kitId, {
    path: kitPath,
    properties: {
      can_have_chains: 1,
      can_have_drum_pads: 1,
      drum_pads: children(...padIds),
      chains: children(...chainIds),
    },
  });

  for (const [note, padId] of padIds.entries()) {
    registerMockObject(padId, {
      path: kitPath.drumPad(note),
      properties: { note },
    });
  }

  for (const [index, chainId] of chainIds.entries()) {
    registerMockObject(chainId, {
      path: kitPath.chain(index),
      properties: {
        in_note: FIRST_PAD_NOTE + index * 2,
        devices: children(),
      },
      ...fixture.chainOptions?.(index),
    });
  }
}

/** in_note per chain of the layered rack: C1 (36) twice, D1 (38) once. */
export const LAYERED_CHAIN_NOTES = [36, 38, 36];

export interface LayeredDrumRackFixture {
  /** Extra properties on the rack itself */
  rackProperties?: Record<string, unknown>;
  /** Extra properties for each chain, over its in_note and empty device list */
  chainProperties?: (index: number) => Record<string, unknown>;
  /** Methods each chain answers, such as `insert_device` */
  chainMethods?: (
    index: number,
  ) => Record<string, (...args: unknown[]) => unknown>;
}

/**
 * Register a Drum Rack at t0/d0 whose pad C1 holds two layers and pad D1 one,
 * so the rack's two chain numberings disagree: pC1/c0 and pC1/c1 are chains 0
 * and 2, while pD1/c0 is chain 1.
 * @param fixture - What to add to the rack and its chains
 */
export function registerLayeredDrumRack(
  fixture: LayeredDrumRackFixture = {},
): void {
  registerMockObject("track-0", { path: livePath.track(0) });
  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      chains: children("chain-0", "chain-1", "chain-2"),
      can_have_drum_pads: 1,
      ...fixture.rackProperties,
    },
  });

  for (const [index, inNote] of LAYERED_CHAIN_NOTES.entries()) {
    registerMockObject(`chain-${String(index)}`, {
      path: livePath.track(0).device(0).chain(index),
      type: "DrumChain",
      properties: {
        in_note: inNote,
        devices: children(),
        ...fixture.chainProperties?.(index),
      },
      methods: fixture.chainMethods?.(index),
    });
  }
}
