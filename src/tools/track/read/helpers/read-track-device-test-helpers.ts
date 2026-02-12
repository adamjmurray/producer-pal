// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { setupTrackMock } from "./read-track-registry-test-helpers.ts";

interface DeviceMockPropertiesOptions {
  name: string;
  className: string;
  classDisplayName: string;
  type: number;
  isActive?: number;
  canHaveChains?: number;
  canHaveDrumPads?: number;
  extraProperties?: Record<string, unknown>;
}

interface RackDeviceMockPropertiesOptions extends DeviceMockPropertiesOptions {
  chainIds?: string[];
  returnChainIds?: string[];
}

interface ChainMockPropertiesOptions {
  name: string;
  color: number;
  deviceIds: string[];
  inNote?: number;
  mute?: number;
  mutedViaSolo?: number;
  solo?: number;
}

export const ALL_DEVICE_INCLUDE_OPTIONS = [
  "clip-notes",
  "chains",
  "instruments",
  "session-clips",
  "arrangement-clips",
  "audio-effects",
];

/**
 * Create standard device properties for read-track tests.
 * @param options - Device options
 * @param options.name - Device name
 * @param options.className - Live API class name
 * @param options.classDisplayName - Human-readable class name
 * @param options.type - Live API device type
 * @param options.isActive - Whether the device is active
 * @param options.canHaveChains - Whether the device can contain chains
 * @param options.canHaveDrumPads - Whether the device can contain drum pads
 * @param options.extraProperties - Additional raw properties to merge
 * @returns Device properties
 */
export function createDeviceMockProperties({
  name,
  className,
  classDisplayName,
  type,
  isActive = 1,
  canHaveChains = 0,
  canHaveDrumPads = 0,
  extraProperties = {},
}: DeviceMockPropertiesOptions): Record<string, unknown> {
  return {
    name,
    class_name: className,
    class_display_name: classDisplayName,
    type,
    is_active: isActive,
    can_have_chains: canHaveChains,
    can_have_drum_pads: canHaveDrumPads,
    ...extraProperties,
  };
}

/**
 * Create rack device properties with chain and return-chain IDs.
 * @param options - Rack options
 * @param options.chainIds - Child chain IDs
 * @param options.returnChainIds - Return-chain IDs
 * @returns Rack properties
 */
export function createRackDeviceMockProperties({
  chainIds = [],
  returnChainIds = [],
  ...deviceOptions
}: RackDeviceMockPropertiesOptions): Record<string, unknown> {
  return createDeviceMockProperties({
    ...deviceOptions,
    canHaveChains: 1,
    extraProperties: {
      chains: chainIds.length > 0 ? children(...chainIds) : [],
      return_chains:
        returnChainIds.length > 0 ? children(...returnChainIds) : [],
      ...(deviceOptions.extraProperties ?? {}),
    },
  });
}

/**
 * Create chain properties with common mute/solo defaults.
 * @param options - Chain options
 * @param options.name - Chain name
 * @param options.color - Chain color as decimal integer
 * @param options.deviceIds - Device IDs on the chain
 * @param options.inNote - MIDI note mapped to drum-chain input
 * @param options.mute - Mute state (0 or 1)
 * @param options.mutedViaSolo - Muted-via-solo state (0 or 1)
 * @param options.solo - Solo state (0 or 1)
 * @returns Chain properties
 */
export function createChainMockProperties({
  name,
  color,
  deviceIds,
  inNote,
  mute = 0,
  mutedViaSolo = 0,
  solo = 0,
}: ChainMockPropertiesOptions): Record<string, unknown> {
  return {
    ...(inNote == null ? {} : { in_note: inNote }),
    name,
    color,
    mute,
    muted_via_solo: mutedViaSolo,
    solo,
    devices: deviceIds.length > 0 ? children(...deviceIds) : [],
  };
}

/**
 * Register a standard instrument rack on track 0 for nested-chain tests.
 * @param chainIds - Rack chain IDs
 */
export function setupInstrumentRackOnTrack0(chainIds: string[]): void {
  setupTrackMock({
    trackId: "track1",
    properties: {
      devices: children("rack1"),
    },
  });
  registerMockObject("rack1", {
    path: "live_set tracks 0 devices 0",
    type: "Device",
    properties: createRackDeviceMockProperties({
      name: "My Custom Rack",
      className: "InstrumentGroupDevice",
      classDisplayName: "Instrument Rack",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      chainIds,
    }),
  });
}

/**
 * Expected instrument-rack payload for a single "Piano" chain.
 * @param nestedDeviceId - Device ID inside chain1
 * @returns Expected instrument payload
 */
export function createSinglePianoChainRackExpectation(
  nestedDeviceId: string,
): Record<string, unknown> {
  return {
    id: "rack1",
    type: "instrument-rack",
    name: "My Custom Rack",
    chains: [
      {
        id: "chain1",
        type: "Chain",
        name: "Piano",
        color: "#FF0000",
        devices: [
          {
            id: nestedDeviceId,
            type: "instrument: Operator",
            name: "Lead Synth",
          },
        ],
      },
    ],
  };
}
