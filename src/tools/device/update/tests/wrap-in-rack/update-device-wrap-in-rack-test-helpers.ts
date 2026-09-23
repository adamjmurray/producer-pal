// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type PathLike } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  livePath,
  registerMockObject,
} from "../update-device-test-helpers.ts";

/** Error thrown by the mock track's insert_device in wrap-failure tests. */
export const INSERT_DEVICE_FAILURE = "insert_device failed";

/**
 * Register an audio-effect device (Live device type 2) in a track 0 slot.
 * @param id - Mock object ID
 * @param deviceIndex - Device slot on track 0
 * @returns The registered device mock
 */
export function registerAudioEffectDevice(
  id: string,
  deviceIndex: number,
): RegisteredMockObject {
  return registerMockObject(id, {
    path: livePath.track(0).device(deviceIndex),
    type: "RackDevice",
    properties: { type: 2 },
  });
}

/**
 * Register an instrument device (Live device type 1) in a track 0 slot.
 * @param id - Mock object ID
 * @param deviceIndex - Device slot on track 0
 * @returns The registered device mock
 */
export function registerInstrumentDevice(
  id: string,
  deviceIndex: number,
): RegisteredMockObject {
  return registerMockObject(id, {
    path: livePath.track(0).device(deviceIndex),
    type: "RackDevice",
    properties: { type: 1 },
  });
}

/**
 * Register track 0 with an insert_device that creates the "new-rack" mock.
 * @returns The registered track mock
 */
export function registerTrack0(): RegisteredMockObject {
  return registerMockObject("track-0", {
    path: livePath.track(0),
    methods: { insert_device: () => ["id", "new-rack"] },
  });
}

/**
 * Register track 0 with an insert_device that throws, to exercise wrap-failure
 * cleanup paths.
 * @returns The registered track mock
 */
export function registerThrowingTrack0(): RegisteredMockObject {
  return registerMockObject("track-0", {
    path: livePath.track(0),
    methods: {
      insert_device: () => {
        throw new Error(INSERT_DEVICE_FAILURE);
      },
    },
  });
}

/**
 * Register the "new-rack" mock whose chain list grows by one per insert_chain
 * call, so the wrap code's chain-creation loop bounds become observable.
 * @param initialChainCount - How many chains the rack reports before any insert
 * @param path - Where the rack sits; a real device slot lets it be deleted
 * @returns The registered rack mock
 */
export function registerGrowingChainRack(
  initialChainCount: number,
  path: PathLike = "new-rack",
): RegisteredMockObject {
  let chainCount = initialChainCount;

  const rack = registerMockObject("new-rack", {
    path,
    type: "RackDevice",
    properties: { chains: [] },
  });

  rack.get.mockImplementation((prop: string) => {
    if (prop === "chains") {
      const chains: string[] = [];

      for (let i = 0; i < chainCount; i++) {
        chains.push("id", `chain-${i}`);
      }

      return chains;
    }

    return [0];
  });
  rack.call.mockImplementation((method: string) => {
    if (method === "insert_chain") {
      chainCount++;

      return ["id", `chain-${chainCount - 1}`];
    }

    return null;
  });

  return rack;
}

/** Picks moves by device id and target id, both "id X". */
export type MoveFilter = (id: string, to: string) => boolean;

/**
 * Make a mock track or chain hold whatever live_set's move_device calls moved
 * into it, less what they moved out, so read-backs see the moves.
 * @param liveSet - The live_set mock the moves go through
 * @param container - The track or chain mock
 * @param ignores - Which moves Live silently ignores, by device and target id
 */
export function followMoves(
  liveSet: RegisteredMockObject,
  container: RegisteredMockObject,
  ignores: MoveFilter = () => false,
): void {
  const target = `id ${container.id}`;

  container.get.mockImplementation((prop: string) => {
    if (prop !== "devices") {
      return [0];
    }

    const held: string[] = [];

    for (const [method, id, to, index] of liveSet.call.mock.calls) {
      if (method !== "move_device" || ignores(id, to)) {
        continue;
      }

      if (held.includes(id)) {
        held.splice(held.indexOf(id), 1);
      }

      if (to === target) {
        held.splice(index, 0, id);
      }
    }

    return held.flatMap((id) => id.split(" "));
  });
}

/**
 * Register the rack's chain 0, holding what live_set moves into it.
 * @param liveSet - The live_set mock the moves go through
 * @param ignores - Which moves Live silently ignores
 * @returns The chain mock
 */
export function registerTrackingChain(
  liveSet: RegisteredMockObject,
  ignores?: MoveFilter,
): RegisteredMockObject {
  const chain = registerMockObject("chain-0", {
    type: "Chain",
    path: "new-rack chains 0",
  });

  followMoves(liveSet, chain, ignores);

  return chain;
}

/**
 * Register the live_set mock supporting the temp-track lifecycle used by
 * instrument wrapping, plus the temp track it creates, which holds what moves
 * onto it.
 * @param ignores - Which moves Live silently ignores on the temp track
 * @returns The registered live_set mock
 */
export function registerTempTrackMocks(
  ignores?: MoveFilter,
): RegisteredMockObject {
  const liveSet = registerMockObject("live-set", {
    path: "live_set",
    methods: {
      create_midi_track: () => ["id", "temp-track"],
      delete_track: () => null,
    },
  });

  const tempTrack = registerMockObject("temp-track", {
    path: livePath.track(1),
  });

  followMoves(liveSet, tempTrack, ignores);

  return liveSet;
}
