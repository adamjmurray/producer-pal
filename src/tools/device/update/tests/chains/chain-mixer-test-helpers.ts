// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface ChainMixerMocks {
  chain: RegisteredMockObject;
  volume: RegisteredMockObject;
  panning: RegisteredMockObject;
  send: RegisteredMockObject;
  activator: RegisteredMockObject;
}

/**
 * Register a rack at t0/d0 with one return chain ("a Reverb") and a chain
 * `chain-0` at c0, whose mixer has a volume, a pan, one send and an activator.
 * @param chainType - The chain's Live type
 * @returns The chain and its mixer's parameters
 */
export function registerChainMixer(
  chainType: "Chain" | "DrumChain",
): ChainMixerMocks {
  const rackPath = livePath.track(0).device(0);
  const chainPath = rackPath.chain(0);
  const mixerPath = `${chainPath} mixer_device`;
  const chain = registerMockObject("chain-0", {
    path: chainPath,
    type: chainType,
  });

  registerMockObject("mixer-0", {
    path: mixerPath,
    properties: { sends: children("send-0") },
  });

  const send = registerMockObject("send-0");

  registerMockObject("rack-0", {
    path: rackPath,
    properties: { return_chains: children("rc-0") },
  });
  registerMockObject("rc-0", { properties: { name: "a Reverb" } });

  return {
    chain,
    send,
    volume: registerMockObject("volume-0", {
      path: `${mixerPath} volume`,
      properties: { display_value: 0 },
    }),
    panning: registerMockObject("panning-0", {
      path: `${mixerPath} panning`,
      properties: { value: 0 },
    }),
    activator: registerMockObject("activator-0", {
      path: `${mixerPath} chain_activator`,
    }),
  };
}
