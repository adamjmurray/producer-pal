// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import {
  applySpecializedParamWrite,
  readSpecializedOptions,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Encode a routing dict value for the mock get() call.
 * The live-api-extensions getProperty() logic calls JSON.parse(rawValue[0])
 * then reads the named key from the resulting object.
 * @param property - Live API property name (used as the JSON wrapper key)
 * @param value - The dict value to return (object or array)
 * @returns Single-element array wrapping the JSON string
 */
function routingProp(property: string, value: unknown): unknown[] {
  return [JSON.stringify({ [property]: value })];
}

interface RoutingEntry {
  display_name: string;
  identifier: number;
}

// Routing-type entries used across tests.
const NO_INPUT_ENTRY: RoutingEntry = {
  display_name: "No Input",
  identifier: 0,
};
const DRIFT_ENTRY: RoutingEntry = { display_name: "Drift", identifier: 3 };
const AUDIO_FX_ENTRY: RoutingEntry = {
  display_name: "AudioFX",
  identifier: 16,
};
const EXT_IN_ENTRY: RoutingEntry = { display_name: "Ext. In", identifier: 1 };
const RETURN_ENTRY: RoutingEntry = { display_name: "A-Reverb", identifier: 30 };
const MASTER_ENTRY: RoutingEntry = { display_name: "Main", identifier: 40 };

// Channel entries used across tests.
const PRE_FX_ENTRY: RoutingEntry = { display_name: "Pre FX", identifier: 20 };
const POST_FX_ENTRY: RoutingEntry = {
  display_name: "Post FX",
  identifier: 21,
};
const POST_MIXER_ENTRY: RoutingEntry = {
  display_name: "Post Mixer",
  identifier: 22,
};

const DEFAULT_AVAILABLE_TYPES: RoutingEntry[] = [
  NO_INPUT_ENTRY,
  EXT_IN_ENTRY,
  DRIFT_ENTRY,
  AUDIO_FX_ENTRY,
];

const DEFAULT_AVAILABLE_CHANNELS: RoutingEntry[] = [
  PRE_FX_ENTRY,
  POST_FX_ENTRY,
  POST_MIXER_ENTRY,
];

interface CompressorOverrides {
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
function registerCompressor(overrides: CompressorOverrides = {}): LiveAPI {
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
function registerLiveSetTracks(): void {
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
 * return/master sources to track ids (AJM-391).
 */
function registerLiveSetWithReturnsAndMaster(): void {
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

// ---------------------------------------------------------------------------
// sidechainSourceTrackId — read
// ---------------------------------------------------------------------------

describe("Compressor sidechainSourceTrackId read", () => {
  it("returns null when input_routing_type is null (no sidechain set)", () => {
    registerLiveSetTracks();
    const device = registerCompressor({ inputRoutingType: null });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: null,
    });
  });

  it("returns null when display_name is 'No Input'", () => {
    registerLiveSetTracks();
    const device = registerCompressor({
      inputRoutingType: NO_INPUT_ENTRY,
    });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: null,
    });
  });

  it("returns the matching track id when display_name matches a track name", () => {
    registerLiveSetTracks();
    const device = registerCompressor({ inputRoutingType: DRIFT_ENTRY });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: "t1",
    });
  });

  it("returns null when display_name does not match any track", () => {
    registerLiveSetTracks();
    const device = registerCompressor({ inputRoutingType: EXT_IN_ENTRY });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: null,
    });
  });

  it("resolves a return-track source to its track id", () => {
    registerLiveSetWithReturnsAndMaster();
    const device = registerCompressor({
      availableTypes: [...DEFAULT_AVAILABLE_TYPES, RETURN_ENTRY],
      inputRoutingType: RETURN_ENTRY,
    });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: "r1",
    });
  });

  it("resolves a master-track source to its track id", () => {
    registerLiveSetWithReturnsAndMaster();
    const device = registerCompressor({
      availableTypes: [...DEFAULT_AVAILABLE_TYPES, MASTER_ENTRY],
      inputRoutingType: MASTER_ENTRY,
    });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: "master-1",
    });
  });

  it("still returns null for Ext. In when returns/master are present", () => {
    registerLiveSetWithReturnsAndMaster();
    const device = registerCompressor({ inputRoutingType: EXT_IN_ENTRY });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainSourceTrackId",
      value: null,
    });
  });
});

// ---------------------------------------------------------------------------
// sidechainSourceTrackId — write
// ---------------------------------------------------------------------------

describe("Compressor sidechainSourceTrackId write", () => {
  it("sets the routing type identifier for a valid track", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "t1",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_type",
      JSON.stringify({ input_routing_type: { identifier: 3 } }),
    );
  });

  it("sets the routing type identifier for the second track", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "t2",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_type",
      JSON.stringify({ input_routing_type: { identifier: 16 } }),
    );
  });

  it("warns and skips when the track is not in available routing types", () => {
    registerLiveSetTracks();

    // Register a track not included in available types
    registerMockObject("t3", {
      type: "Device",
      properties: { name: "MIDIOnly" },
    });

    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "t3",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("cannot be a sidechain source"),
    );
  });

  it("clears to No Input when value is 'null'", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "null",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_type",
      JSON.stringify({ input_routing_type: { identifier: 0 } }),
    );
  });

  it("clears to No Input when value is empty string", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_type",
      JSON.stringify({ input_routing_type: { identifier: 0 } }),
    );
  });

  it("warns and skips when the track id does not exist", () => {
    registerLiveSetTracks();
    mockNonExistentObjects();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "999",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("does not exist"),
    );
  });

  it("warns and skips clearing when No Input is not in available types", () => {
    registerLiveSetTracks();
    const device = registerCompressor({
      availableTypes: [DRIFT_ENTRY, AUDIO_FX_ENTRY],
    });

    applySpecializedParamWrite(
      device,
      "sidechainSourceTrackId",
      "null",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('"No Input"'),
    );
  });
});

// ---------------------------------------------------------------------------
// sidechainChannel — read
// ---------------------------------------------------------------------------

describe("Compressor sidechainChannel read", () => {
  it("returns null when no channel is set", () => {
    registerLiveSetTracks();
    const device = registerCompressor({ inputRoutingChannel: null });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainChannel",
      value: null,
    });
  });

  it("returns the display_name for a set channel", () => {
    registerLiveSetTracks();
    const device = registerCompressor({
      inputRoutingChannel: POST_FX_ENTRY,
    });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainChannel",
      value: "Post FX",
    });
  });

  it("returns 'Pre FX' for the Pre FX channel", () => {
    registerLiveSetTracks();
    const device = registerCompressor({
      inputRoutingChannel: PRE_FX_ENTRY,
    });

    expect(readSpecializedParams(device)).toContainEqual({
      name: "sidechainChannel",
      value: "Pre FX",
    });
  });
});

// ---------------------------------------------------------------------------
// sidechainChannel — write
// ---------------------------------------------------------------------------

describe("Compressor sidechainChannel write", () => {
  it("sets the channel identifier for 'Post FX'", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "Post FX",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_channel",
      JSON.stringify({ input_routing_channel: { identifier: 21 } }),
    );
  });

  it("sets the channel identifier for 'Pre FX'", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "Pre FX",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_channel",
      JSON.stringify({ input_routing_channel: { identifier: 20 } }),
    );
  });

  it("sets the channel identifier for 'Post Mixer'", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "Post Mixer",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_channel",
      JSON.stringify({ input_routing_channel: { identifier: 22 } }),
    );
  });

  it("trims surrounding whitespace before matching the channel name", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "  Post FX  ",
      "updateDevice",
    );

    expect(device.set).toHaveBeenCalledWith(
      "input_routing_channel",
      JSON.stringify({ input_routing_channel: { identifier: 21 } }),
    );
  });

  it("warns and skips for an unavailable channel name", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "Bogus Channel",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("not a valid sidechainChannel"),
    );
  });

  it("warning message includes available channel names", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "Unknown",
      "updateDevice",
    );

    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("Pre FX"));
  });

  it("warns and skips (no throw) when channels are unavailable", () => {
    // Register channels as a raw empty array so getProperty() unwraps to null —
    // exercises the readAvailableChannels `?? []` fallback.
    registerMockObject("comp-1", {
      type: "Device",
      properties: {
        class_display_name: "Compressor",
        available_input_routing_channels: [],
      },
    });
    const device = LiveAPI.from("id comp-1");

    applySpecializedParamWrite(
      device,
      "sidechainChannel",
      "Post FX",
      "updateDevice",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("not a valid sidechainChannel"),
    );
  });
});

// ---------------------------------------------------------------------------
// readOptions — sidechainSourceTrackIds
// ---------------------------------------------------------------------------

describe("Compressor readOptions", () => {
  it("returns trackIds for tracks that match available routing types", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    const options = readSpecializedOptions(device);

    expect(options.sidechainSourceTrackIds).toStrictEqual(["t1", "t2"]);
  });

  it("returns sidechainChannels (display_names for the current source)", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    const options = readSpecializedOptions(device);

    expect(options.sidechainChannels).toStrictEqual([
      "Pre FX",
      "Post FX",
      "Post Mixer",
    ]);
  });

  it("excludes entries that have no matching live_set track (Ext. In, No Input)", () => {
    registerLiveSetTracks();
    const device = registerCompressor();

    const options = readSpecializedOptions(device);

    // Should only have t1 (Drift) and t2 (AudioFX), not No Input or Ext. In
    expect(options.sidechainSourceTrackIds as string[]).toHaveLength(2);
  });

  it("returns empty array when no available types match live_set tracks", () => {
    registerLiveSetTracks();
    const device = registerCompressor({
      availableTypes: [NO_INPUT_ENTRY, EXT_IN_ENTRY],
    });

    const options = readSpecializedOptions(device);

    expect(options.sidechainSourceTrackIds).toStrictEqual([]);
  });

  it("includes return-track and master ids when they are routable sources", () => {
    registerLiveSetWithReturnsAndMaster();
    const device = registerCompressor({
      availableTypes: [...DEFAULT_AVAILABLE_TYPES, RETURN_ENTRY, MASTER_ENTRY],
    });

    const options = readSpecializedOptions(device);

    expect(options.sidechainSourceTrackIds).toStrictEqual([
      "t1",
      "t2",
      "r1",
      "master-1",
    ]);
  });

  it("includes only tracks present in the available routing types list", () => {
    registerLiveSetTracks();
    const device = registerCompressor({
      availableTypes: [NO_INPUT_ENTRY, DRIFT_ENTRY],
    });

    const options = readSpecializedOptions(device);

    expect(options.sidechainSourceTrackIds).toStrictEqual(["t1"]);
  });

  it("returns empty array (no throw) when routing types are unavailable", () => {
    registerLiveSetTracks();
    // Register the list props as raw empty arrays so getProperty() unwraps to
    // null — exercises the readAvailableTypes/Channels `?? []` fallback.
    registerMockObject("comp-1", {
      type: "Device",
      properties: {
        class_display_name: "Compressor",
        available_input_routing_types: [],
        available_input_routing_channels: [],
      },
    });
    const device = LiveAPI.from("id comp-1");

    expect(
      readSpecializedOptions(device).sidechainSourceTrackIds,
    ).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration — via read-device
// ---------------------------------------------------------------------------

describe("Compressor via read-device", () => {
  /**
   * Register a fully-readable mock Compressor device.
   * @param overrides - Optional property overrides
   */
  function registerReadableCompressor(
    overrides: CompressorOverrides = {},
  ): void {
    const availableTypes = overrides.availableTypes ?? DEFAULT_AVAILABLE_TYPES;
    const availableChannels =
      overrides.availableChannels ?? DEFAULT_AVAILABLE_CHANNELS;
    const inputRoutingType = overrides.inputRoutingType ?? DRIFT_ENTRY;
    const inputRoutingChannel = overrides.inputRoutingChannel ?? POST_FX_ENTRY;

    const properties: Record<string, unknown> = {
      name: "Compressor",
      class_display_name: "Compressor",
      type: 2,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: [],
      available_input_routing_types: routingProp(
        "available_input_routing_types",
        availableTypes,
      ),
      available_input_routing_channels: routingProp(
        "available_input_routing_channels",
        availableChannels,
      ),
      input_routing_type: routingProp("input_routing_type", inputRoutingType),
      input_routing_channel: routingProp(
        "input_routing_channel",
        inputRoutingChannel,
      ),
    };

    registerMockObject("comp-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties,
    });
  }

  it("includes sidechainSourceTrackId and sidechainChannel in parameters", () => {
    registerLiveSetTracks();
    registerReadableCompressor();

    const result = readDevice({ deviceId: "comp-1", include: ["params"] });

    expect(result.parameters).toContainEqual({
      name: "sidechainSourceTrackId",
      value: "t1",
    });

    expect(result.parameters).toContainEqual({
      name: "sidechainChannel",
      value: "Post FX",
    });
  });

  it("includes sidechainSourceTrackIds in options when requested", () => {
    registerLiveSetTracks();
    registerReadableCompressor();

    const result = readDevice({
      deviceId: "comp-1",
      include: ["params", "options"],
    });

    expect(result.options).toBeDefined();
    expect(
      (result.options as Record<string, unknown>).sidechainSourceTrackIds,
    ).toStrictEqual(["t1", "t2"]);
  });

  it("omits options when include does not contain 'options'", () => {
    registerLiveSetTracks();
    registerReadableCompressor();

    const result = readDevice({ deviceId: "comp-1", include: ["params"] });

    expect(result.options).toBeUndefined();
  });

  it("omits modulations for Compressor", () => {
    registerLiveSetTracks();
    registerReadableCompressor();

    const result = readDevice({
      deviceId: "comp-1",
      include: ["params", "options"],
    });

    expect(result.modulations).toBeUndefined();
  });
});
