// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";

interface PadProps {
  note?: number;
  name?: string;
  mute?: number;
  solo?: number;
  chainIds?: string[];
}

interface ChainProps {
  name?: string;
  mute?: number;
  solo?: number;
  choke_group?: number;
  out_note?: number;
  color?: number;
  deviceIds?: string[];
  type?: LiveObjectType;
}

interface DeviceProps {
  name?: string;
  class_display_name?: string;
  type?: number;
}

interface DrumPadMockConfig {
  deviceId?: string;
  padIds?: string[];
  padProperties?: Record<string, PadProps>;
  chainProperties?: Record<string, ChainProps>;
  deviceProperties?: Record<string, DeviceProps>;
  returnChainNames?: string[];
}

/**
 * Helper to set up drum pad mocks using the mock registry
 * @param config - Configuration for the mocks
 * @param config.deviceId - Device ID (default: "drum-rack-1")
 * @param config.padIds - Pad IDs (default: ["pad-36"])
 * @param config.padProperties - Pad properties by ID
 * @param config.chainProperties - Chain properties by ID
 * @param config.deviceProperties - Device properties by ID
 * @param config.returnChainNames - Names of the rack's return chains, in send order
 * @returns Registered mock objects for device, pads, chains, and devices
 */
// eslint-disable-next-line complexity -- hierarchical mock setup requires multiple loops
export function setupDrumPadMocks(config: DrumPadMockConfig): {
  device: RegisteredMockObject;
  pads: Record<string, RegisteredMockObject>;
  chains: Record<string, RegisteredMockObject>;
  devices: Record<string, RegisteredMockObject>;
} {
  const {
    deviceId = "drum-rack-1",
    padIds = ["pad-36"],
    padProperties = {},
    chainProperties = {},
    deviceProperties = {},
    returnChainNames = [],
  } = config;

  const returnChainIds = returnChainNames.map((_, i) => `return-chain-${i}`);

  // Register the main drum rack device
  const device = registerMockObject(deviceId, {
    path: livePath.track(1).device(0),
    type: "Device",
    properties: {
      can_have_drum_pads: 1,
      drum_pads: padIds.flatMap((p) => ["id", p]),
      return_chains: returnChainIds.flatMap((c) => ["id", c]),
    },
  });

  const devicePath = livePath.track(1).device(0);

  for (const [returnIndex, returnId] of returnChainIds.entries()) {
    registerMockObject(returnId, {
      path: `${devicePath} return_chains ${returnIndex}`,
      type: "Chain",
      properties: { name: returnChainNames[returnIndex] },
    });
  }

  // Live indexes `drum_pads` by MIDI note, and keeps every drum chain in the
  // rack's own `chains` list in note order — so a chain's path is
  // "<rack> chains N", never nested under "drum_pads N". Getting this wrong
  // hides bugs in code that walks up from a chain path to find its rack.
  const padsByNote = padIds
    .map((padId) => ({ padId, padProps: padProperties[padId] ?? {} }))
    .toSorted((a, b) => (a.padProps.note ?? 36) - (b.padProps.note ?? 36));

  const pads: Record<string, RegisteredMockObject> = {};
  const chains: Record<string, RegisteredMockObject> = {};
  let chainIndex = 0;

  for (const { padId, padProps } of padsByNote) {
    const padChainIds = padProps.chainIds ?? [];
    const note = padProps.note ?? 36;

    pads[padId] = registerMockObject(padId, {
      path: `${devicePath} drum_pads ${note}`,
      type: "DrumPad",
      properties: {
        note,
        name: padProps.name ?? "Kick",
        mute: padProps.mute ?? 0,
        solo: padProps.solo ?? 0,
        chains: padChainIds.flatMap((c) => ["id", c]),
      },
    });

    for (const chainId of padChainIds) {
      const chainProps = chainProperties[chainId] ?? {};
      const chainDeviceIds = chainProps.deviceIds ?? [];

      chains[chainId] = registerMockObject(chainId, {
        path: `${devicePath} chains ${chainIndex++}`,
        type: chainProps.type ?? "DrumChain",
        properties: {
          name: chainProps.name ?? "Chain",
          mute: chainProps.mute ?? 0,
          solo: chainProps.solo ?? 0,
          muted_via_solo: 0,
          choke_group: chainProps.choke_group ?? 0,
          out_note: chainProps.out_note ?? 36,
          ...(chainProps.color ? { color: chainProps.color } : {}),
          devices: chainDeviceIds.flatMap((d) => ["id", d]),
        },
      });
    }
  }

  // Register devices (from all chains)
  const devices: Record<string, RegisteredMockObject> = {};

  for (const [chainId, chainMock] of Object.entries(chains)) {
    const chainProps = chainProperties[chainId] ?? {};
    const chainDeviceIds = chainProps.deviceIds ?? [];

    for (const [devIndex, devId] of chainDeviceIds.entries()) {
      const devProps = deviceProperties[devId] ?? {};

      devices[devId] = registerMockObject(devId, {
        path: `${chainMock.path} devices ${devIndex}`,
        type: "Device",
        properties: {
          name: devProps.name ?? "Device",
          class_display_name: devProps.class_display_name ?? "Device",
          type: devProps.type ?? 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
          is_active: 1,
          devices: [],
        },
      });
    }
  }

  return {
    device,
    pads,
    chains,
    devices,
  };
}
