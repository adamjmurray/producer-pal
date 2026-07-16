// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
} from "#src/tools/constants.ts";
import { readDevice } from "../device-reader.ts";

const DEVICE_PATH = "live_set tracks 0 devices 0";

/**
 * Register a chain-holding rack on track 0 with one chain (optionally a return
 * chain and drum-pad capability), so the include-flag defaults are observable.
 * @param opts - Rack shape options
 * @param opts.drumPads - Register as a Drum Rack (chain carries an in_note)
 * @param opts.returnChains - Give the rack a return chain
 */
function registerRack(
  opts: { drumPads?: boolean; returnChains?: boolean } = {},
): void {
  registerMockObject("chain0", {
    type: opts.drumPads ? "DrumChain" : "Chain",
    properties: { name: "Chain 1", in_note: 36 },
  });
  registerMockObject("rchain0", {
    type: "Chain",
    properties: { name: "Return Chain" },
  });

  registerMockObject("rack", {
    path: DEVICE_PATH,
    type: "RackDevice",
    properties: {
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      class_display_name: "Drum Rack",
      name: "Drum Rack",
      can_have_chains: 1,
      can_have_drum_pads: opts.drumPads ? 1 : 0,
      is_active: 1,
      chains: ["id", "chain0"],
      return_chains: opts.returnChains ? ["id", "rchain0"] : [],
    },
  });
}

describe("readDevice option defaults", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("includes chains by default", () => {
    registerRack();

    const result = readDevice(LiveAPI.from(DEVICE_PATH));

    expect(result.chains).toHaveLength(1);
  });

  it("resolves the device path and threads it into nested chain paths", () => {
    // The device path is extracted from the Live API path and passed down, so
    // each chain reports an addressable path rather than null.
    registerRack();

    const result = readDevice(LiveAPI.from(DEVICE_PATH));

    expect(result.path).toBe("t0/d0");
    expect((result.chains as { path: string }[])[0]?.path).toBe("t0/d0/c0");
  });

  it("omits return chains by default", () => {
    registerRack({ returnChains: true });

    expect(readDevice(LiveAPI.from(DEVICE_PATH)).returnChains).toBeUndefined();
  });

  it("includes return chains when requested", () => {
    registerRack({ returnChains: true });

    const result = readDevice(LiveAPI.from(DEVICE_PATH), {
      includeReturnChains: true,
    });

    expect(result.returnChains).toHaveLength(1);
  });

  it("omits drum pads by default", () => {
    registerRack({ drumPads: true });

    expect(readDevice(LiveAPI.from(DEVICE_PATH)).drumPads).toBeUndefined();
  });

  it("reads parameters without values when includeParams is set alone", () => {
    // includeParamValues defaults false → basic (id + name) entries only.
    registerMockObject("param0", {
      type: "DeviceParameter",
      properties: { name: "Cutoff", original_name: "Cutoff" },
    });
    registerMockObject("dev", {
      path: DEVICE_PATH,
      type: "Device",
      properties: {
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        class_display_name: "Reverb",
        name: "Reverb",
        is_active: 1,
        parameters: ["id", "param0"],
      },
    });

    const result = readDevice(LiveAPI.from(DEVICE_PATH), {
      includeParams: true,
    });

    expect(result.parameters).toStrictEqual([{ id: "param0", name: "Cutoff" }]);
  });

  it("omits the focused sample field by default for a loaded Simpler", () => {
    registerMockObject("sample0", {
      type: "Sample",
      properties: { file_path: "/tmp/kick.wav", gain: 1 },
    });
    registerMockObject("simpler", {
      path: DEVICE_PATH,
      type: "SimplerDevice",
      properties: {
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        class_display_name: "Simpler",
        name: "Simpler",
        is_active: 1,
        multi_sample_mode: 0,
        sample: ["id", "sample0"],
      },
    });

    expect(readDevice(LiveAPI.from(DEVICE_PATH)).sample).toBeUndefined();
    expect(
      readDevice(LiveAPI.from(DEVICE_PATH), { includeSample: true }).sample,
    ).toBe("/tmp/kick.wav");
  });
});
