// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Test helper functions for read-track tests
 */
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  createDrumChainMock,
  createSimpleInstrumentMock,
  type DrumChainMockOptions,
  type SimpleInstrumentMockOptions,
} from "./read-track-drum-rack-mock-helpers.ts";

export {
  createDrumChainMock,
  createSimpleInstrumentMock,
  type DrumChainMockOptions,
  type SimpleInstrumentMockOptions,
};

// Constants to avoid duplicate string errors
const HAS_MIDI_INPUT = "has_midi_input";
const TEST_TRACK_NAME = "Test Track";

interface MockTrackOverrides {
  name?: string;
  has_midi_input?: number;
  color?: number;
  mute?: number;
  solo?: number;
  arm?: number;
  can_be_armed?: number;
  is_foldable?: number;
  is_grouped?: number;
  group_track?: [string, number];
  playing_slot_index?: number;
  fired_slot_index?: number;
  muted_via_solo?: number;
  clip_slots?: unknown[];
  arrangement_clips?: unknown[];
  devices?: unknown[];
  back_to_arranger?: number;
  mixer_device?: unknown;
  [key: string]: unknown;
}

interface RoutingMockOverrides {
  available_input_routing_channels?: string[];
  available_input_routing_types?: string[];
  available_output_routing_channels?: string[];
  available_output_routing_types?: string[];
  input_routing_channel?: string[];
  input_routing_type?: string[];
  output_routing_channel?: string[];
  output_routing_type?: string[];
  [key: string]: unknown;
}

/**
 * Creates a mock track object with default properties
 * @param overrides - Properties to override the defaults
 * @returns Mock track properties
 */
export const mockTrackProperties = (
  overrides: MockTrackOverrides = {},
): MockTrackOverrides => ({
  name: TEST_TRACK_NAME,
  [HAS_MIDI_INPUT]: 1,
  color: 0,
  mute: 0,
  solo: 0,
  arm: 0,
  can_be_armed: 1,
  is_foldable: 0,
  is_grouped: 0,
  group_track: ["id", 0],
  playing_slot_index: -1,
  fired_slot_index: -1,
  muted_via_solo: 0,
  clip_slots: [],
  arrangement_clips: [],
  devices: [],
  back_to_arranger: 0,
  mixer_device: children("mixer_1"),
  ...overrides,
});

/**
 * Creates standard routing mock properties for track routing tests.
 * @param overrides - Properties to override the defaults
 * @returns Routing properties for mockTrackProperties
 */
export function createRoutingMockProperties(
  overrides: RoutingMockOverrides = {},
): RoutingMockOverrides {
  return {
    available_input_routing_channels: [
      '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
    ],
    available_input_routing_types: [
      '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
    ],
    available_output_routing_channels: [
      '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
    ],
    available_output_routing_types: [
      '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
    ],
    input_routing_channel: [
      '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
    ],
    input_routing_type: [
      '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
    ],
    output_routing_channel: [
      '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
    ],
    output_routing_type: [
      '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
    ],
    ...overrides,
  };
}

interface SetupDrumRackMockOptions {
  kickDeviceId?: string;
}

/**
 * Setup complete drum rack mocks with track, chain, and kick instrument.
 * Configures registry-based track/device mocks for drum rack testing.
 * @param options - Configuration options
 * @param options.kickDeviceId - ID for the kick device (default: "kick_device")
 */
export function setupDrumRackMocks(
  options: SetupDrumRackMockOptions = {},
): void {
  const { kickDeviceId = "kick_device" } = options;

  registerMockObject("track1", {
    path: "live_set tracks 0",
    type: "Track",
    properties: mockTrackProperties({
      devices: children("drumrack1"),
    }),
  });
  registerMockObject("drumrack1", {
    path: "live_set tracks 0 devices 0",
    type: "Device",
    properties: {
      name: "Test Drum Rack",
      class_name: "DrumGroupDevice",
      class_display_name: "Drum Rack",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      is_active: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      chains: children("chain1"),
      return_chains: [],
    },
  });
  registerMockObject("chain1", {
    path: "live_set tracks 0 devices 0 chains 0",
    type: "Chain",
    properties: {
      in_note: 60, // C3
      name: "Test Kick",
      mute: 0,
      muted_via_solo: 0,
      solo: 0,
      devices: children(kickDeviceId),
    },
  });
  registerMockObject(kickDeviceId, {
    path: "live_set tracks 0 devices 0 chains 0 devices 0",
    type: "Device",
    properties: {
      name: "Kick Instrument",
      class_name: "Simpler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });
}
