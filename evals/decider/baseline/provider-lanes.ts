// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Limits how many decider calls run at once per provider, so two deciders in
 * one comparison can run side by side while a local Ollama still sees one call
 * at a time. Deciders on the same provider share a lane.
 */

import {
  defaultConcurrency,
  type DeciderProvider,
} from "../decider-provider.ts";

export interface ProviderLanes {
  /** How many calls the provider's lane lets through at once */
  limit: (provider: DeciderProvider) => number;
  /** Run a call once its provider's lane has room */
  run: <T>(provider: DeciderProvider, fn: () => Promise<T>) => Promise<T>;
}

/**
 * Make the lanes.
 *
 * @param override - A limit the user gave for every lane; otherwise each provider's default
 * @returns The lanes
 */
export function providerLanes(override?: number): ProviderLanes {
  const lanes = new Map<DeciderProvider, Lane>();
  const limit = (provider: DeciderProvider): number =>
    override ?? defaultConcurrency({ provider });

  const laneFor = (provider: DeciderProvider): Lane => {
    let lane = lanes.get(provider);

    if (lane == null) {
      lane = { active: 0, waiting: [] };
      lanes.set(provider, lane);
    }

    return lane;
  };

  return {
    limit,
    run: async (provider, fn) => {
      const lane = laneFor(provider);

      if (lane.active < limit(provider)) {
        lane.active++;
      } else {
        // The finishing call hands its slot over, so the lane never overfills.
        await new Promise<void>((resolve) => lane.waiting.push(resolve));
      }

      try {
        return await fn();
      } finally {
        const next = lane.waiting.shift();

        if (next == null) {
          lane.active--;
        } else {
          next();
        }
      }
    },
  };
}

interface Lane {
  active: number;
  waiting: (() => void)[];
}
