// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A chain with a mixer at track 0 / device 0 / chain 1, and its rack's return
// chains, for the chain-mixer tests.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

export const rackPath = livePath.track(0).device(0);
export const chainPath = rackPath.chain(1);
const mixerPath = `${chainPath} mixer_device`;

export interface MixerMocks {
  chain: RegisteredMockObject;
  volume: RegisteredMockObject;
  panning: RegisteredMockObject;
}

/**
 * Register a chain with a mixer at track 0 / device 0 / chain 1
 * @param overrides - Mixer values (defaults are all neutral)
 * @param overrides.gainDb - Volume in dB
 * @param overrides.pan - Pan -1..1
 * @param overrides.sends - Send {value, display_value} pairs
 * @param overrides.type - Chain type
 * @returns The registered chain and its volume/panning parameters
 */
export function registerChainWithMixer({
  gainDb = 0,
  pan = 0,
  sends = [],
  type = "DrumChain",
  disabled = [],
}: {
  // Max can serialize a tiny float32 as an exponent-notation string, so tests
  // exercising that need to pass one through here.
  gainDb?: number | string;
  pan?: number | string;
  sends?: { value: number | string; display_value: number }[];
  type?: "Chain" | "DrumChain";
  disabled?: ("volume" | "panning")[];
} = {}): MixerMocks {
  const chain = registerMockObject("chain-1", {
    path: chainPath,
    type,
    properties: { name: "Snare" },
  });

  registerMockObject("mixer-1", {
    path: mixerPath,
    type: "ChainMixerDevice",
    properties: {
      sends: children(...sends.map((_, i) => `send-${i}`)),
    },
  });
  const volume = registerMockObject("volume-1", {
    path: `${mixerPath} volume`,
    type: "DeviceParameter",
    properties: {
      display_value: gainDb,
      is_enabled: disabled.includes("volume") ? 0 : 1,
    },
  });
  const panning = registerMockObject("panning-1", {
    path: `${mixerPath} panning`,
    type: "DeviceParameter",
    properties: {
      value: pan,
      is_enabled: disabled.includes("panning") ? 0 : 1,
    },
  });

  for (const [i, send] of sends.entries()) {
    registerMockObject(`send-${i}`, {
      type: "DeviceParameter",
      properties: send,
    });
  }

  return { chain, volume, panning };
}

/**
 * Register the rack holding the chain, with one return chain per name. Sends
 * are matched to returns by position, so the order is the send order. A
 * number simulates Live returning an all-digit name as a number, not a string.
 * @param names - Return chain names
 */
export function registerReturnChains(...names: (string | number)[]): void {
  registerMockObject("rack-1", {
    path: rackPath,
    type: "RackDevice",
    properties: { return_chains: children(...names.map((_, i) => `rc-${i}`)) },
  });

  for (const [i, name] of names.entries()) {
    registerMockObject(`rc-${i}`, { type: "Chain", properties: { name } });
  }
}

/**
 * Point a fresh LiveAPI at the registered chain
 * @returns The chain object
 */
export function chainApi(): LiveAPI {
  return LiveAPI.from(chainPath);
}
