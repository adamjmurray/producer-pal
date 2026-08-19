// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * @returns The registered rack mock
 */
export function registerGrowingChainRack(
  initialChainCount: number,
): RegisteredMockObject {
  let chainCount = initialChainCount;

  const rack = registerMockObject("new-rack", {
    path: "new-rack",
    type: "RackDevice",
    properties: { chains: [] },
  });

  rack.get.mockImplementation((prop: string) => {
    if (prop === "chains") {
      const chains: string[] = [];

      for (let i = 0; i < chainCount; i++) chains.push("id", `chain-${i}`);

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

/**
 * Register chain mocks resolvable by the rack's "${rack.path} chains ${i}" path.
 * @param count - How many chains to register, starting at chain-0
 */
export function registerRackChains(count: number): void {
  for (let i = 0; i < count; i++) {
    registerMockObject(`chain-${i}`, {
      type: "Chain",
      path: `new-rack chains ${i}`,
    });
  }
}

/**
 * Register the live_set mock supporting the temp-track lifecycle used by
 * instrument wrapping, plus the temp track it creates.
 * @returns The registered live_set mock
 */
export function registerTempTrackMocks(): RegisteredMockObject {
  const liveSet = registerMockObject("live-set", {
    path: "live_set",
    methods: {
      create_midi_track: () => ["id", "temp-track"],
      delete_track: () => null,
    },
  });

  registerMockObject("temp-track", {
    path: livePath.track(1),
  });

  return liveSet;
}
