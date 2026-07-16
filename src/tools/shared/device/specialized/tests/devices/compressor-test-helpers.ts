// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

// Shared mock data + builders for the Compressor spec tests (compressor.test.ts
// and compressor-sidechain-input.test.ts). Compressor's sidechain source/channel
// are Live routing dicts, so the mocks must round-trip them as JSON strings.

/**
 * Encode a routing dict value for the mock get() call.
 * The live-api-extensions getProperty() logic calls JSON.parse(rawValue[0])
 * then reads the named key from the resulting object.
 * @param property - Live API property name (used as the JSON wrapper key)
 * @param value - The dict value to return (object or array)
 * @returns Single-element array wrapping the JSON string
 */
export function routingProp(property: string, value: unknown): unknown[] {
  return [JSON.stringify({ [property]: value })];
}

export interface RoutingEntry {
  display_name: string;
  identifier: number;
}

// Routing-type entries used across tests.
export const NO_INPUT_ENTRY: RoutingEntry = {
  display_name: "No Input",
  identifier: 0,
};
export const DRIFT_ENTRY: RoutingEntry = {
  display_name: "Drift",
  identifier: 3,
};
export const AUDIO_FX_ENTRY: RoutingEntry = {
  display_name: "AudioFX",
  identifier: 16,
};
export const EXT_IN_ENTRY: RoutingEntry = {
  display_name: "Ext. In",
  identifier: 1,
};
export const RETURN_ENTRY: RoutingEntry = {
  display_name: "A-Reverb",
  identifier: 30,
};
export const MASTER_ENTRY: RoutingEntry = {
  display_name: "Main",
  identifier: 40,
};

// Channel entries used across tests.
export const PRE_FX_ENTRY: RoutingEntry = {
  display_name: "Pre FX",
  identifier: 20,
};
export const POST_FX_ENTRY: RoutingEntry = {
  display_name: "Post FX",
  identifier: 21,
};
export const POST_MIXER_ENTRY: RoutingEntry = {
  display_name: "Post Mixer",
  identifier: 22,
};

export const DEFAULT_AVAILABLE_TYPES: RoutingEntry[] = [
  NO_INPUT_ENTRY,
  EXT_IN_ENTRY,
  DRIFT_ENTRY,
  AUDIO_FX_ENTRY,
];

export const DEFAULT_AVAILABLE_CHANNELS: RoutingEntry[] = [
  PRE_FX_ENTRY,
  POST_FX_ENTRY,
  POST_MIXER_ENTRY,
];

export interface CompressorOverrides {
  inputRoutingType?: RoutingEntry | null;
  availableTypes?: RoutingEntry[];
  inputRoutingChannel?: RoutingEntry | null;
  availableChannels?: RoutingEntry[];
}

/**
 * Register a mock Compressor device and return its LiveAPI.
 * @param overrides - Optional property overrides
 * @returns The Compressor LiveAPI object
 */
export function registerCompressor(
  overrides: CompressorOverrides = {},
): LiveAPI {
  const availableTypes = overrides.availableTypes ?? DEFAULT_AVAILABLE_TYPES;
  const availableChannels =
    overrides.availableChannels ?? DEFAULT_AVAILABLE_CHANNELS;
  const inputRoutingType =
    overrides.inputRoutingType !== undefined
      ? overrides.inputRoutingType
      : null;
  const inputRoutingChannel =
    overrides.inputRoutingChannel !== undefined
      ? overrides.inputRoutingChannel
      : null;

  const properties: Record<string, unknown> = {
    class_display_name: "Compressor",
    available_input_routing_types: routingProp(
      "available_input_routing_types",
      availableTypes,
    ),
    available_input_routing_channels: routingProp(
      "available_input_routing_channels",
      availableChannels,
    ),
  };

  if (inputRoutingType != null) {
    properties.input_routing_type = routingProp(
      "input_routing_type",
      inputRoutingType,
    );
  }

  if (inputRoutingChannel != null) {
    properties.input_routing_channel = routingProp(
      "input_routing_channel",
      inputRoutingChannel,
    );
  }

  registerMockObject("comp-1", { type: "Device", properties });

  return LiveAPI.from("id comp-1");
}

/**
 * Register the live_set with two tracks: Drift (t1) and AudioFX (t2).
 */
export function registerLiveSetTracks(): void {
  registerMockObject("live_set", {
    path: "live_set",
    type: "Device",
    properties: {
      tracks: ["id", "t1", "id", "t2"],
    },
  });

  registerMockObject("t1", {
    type: "Device",
    properties: { name: "Drift" },
  });

  registerMockObject("t2", {
    type: "Device",
    properties: { name: "AudioFX" },
  });
}

/**
 * Register a live_set that also exposes a return track ("A-Reverb", id "r1") and
 * the master track ("Main", id "master-1"), so sidechain reads can resolve
 * return/master sources to track ids.
 */
export function registerLiveSetWithReturnsAndMaster(): void {
  registerMockObject("live_set", {
    path: "live_set",
    type: "Device",
    properties: {
      tracks: ["id", "t1", "id", "t2"],
      return_tracks: ["id", "r1"],
    },
  });

  registerMockObject("t1", { type: "Device", properties: { name: "Drift" } });
  registerMockObject("t2", { type: "Device", properties: { name: "AudioFX" } });
  registerMockObject("r1", {
    type: "Device",
    properties: { name: "A-Reverb" },
  });
  registerMockObject("master-1", {
    path: "live_set master_track",
    type: "Device",
    properties: { name: "Main" },
  });
}
