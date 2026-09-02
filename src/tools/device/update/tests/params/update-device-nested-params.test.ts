// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import {
  type RegisteredMockObject,
  children,
  expectValueSet,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Register a Drum Rack at t0/d0 with a single empty C1 (MIDI 36) pad chain
 * whose device slot auto-creates a Simpler on insert.
 * @returns The C1 chain mock
 */
function registerDrumRackWithEmptyC1(): RegisteredMockObject {
  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
  });

  const chain = registerMockObject("chain-c1", {
    type: "DrumChain",
    properties: { in_note: 36, devices: [] },
    methods: { insert_device: () => ["id", "new-simpler"] },
  });

  registerMockObject("new-simpler", {
    type: "SimplerDevice",
    properties: { class_display_name: "Simpler", multi_sample_mode: 0 },
  });

  return chain;
}

/**
 * Register a Drum Rack at t0/d0 whose C1 pad already holds a DrumSampler.
 * @returns The C1 chain mock
 */
function registerDrumRackWithDrumSamplerOnC1(): RegisteredMockObject {
  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
  });

  const chain = registerMockObject("chain-c1", {
    type: "DrumChain",
    properties: { in_note: 36, devices: ["id", "ds-1"] },
    methods: { insert_device: () => ["id", "new-simpler"] },
  });

  registerMockObject("ds-1", {
    type: "Device",
    properties: {
      class_display_name: "DrumSampler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });
  registerMockObject("new-simpler", {
    type: "SimplerDevice",
    properties: { class_display_name: "Simpler", multi_sample_mode: 0 },
  });

  return chain;
}

describe("updateDevice - path-prefixed pseudo-params", () => {
  it("loads a sample into a drum pad by addressing the rack", () => {
    const chain = registerDrumRackWithEmptyC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/d0/sample", value: "/snare.wav" }],
    });

    expect(chain.call).toHaveBeenCalledWith("insert_device", "Simpler");
    expect(LiveAPI.from("id new-simpler").call).toHaveBeenCalledWith(
      "replace_sample",
      "/snare.wav",
    );
  });

  it("warns and skips a path-prefixed param with an empty name after '/'", () => {
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: [], can_have_drum_pads: 1 },
    });

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/d0/", value: "/snare.wav" }],
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('empty name after "/"'),
    );
  });

  it("sets a real slash-named param (Dry/Wet) by name, not as a path", () => {
    registerMockObject("dev1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { parameters: children("drywet-param") },
    });
    // Reverb/Delay/Glue Compressor expose a parameter literally named
    // "Dry/Wet". The "/" must NOT route this to path-prefixed pseudo-param
    // handling (which would split it into prefix "Dry" + param "Wet" and drop
    // the write); it has to resolve as an ordinary DeviceParameter by name.
    const param = registerMockObject("drywet-param", {
      properties: {
        name: "Dry/Wet",
        original_name: "Dry/Wet",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (v: unknown) => `${Math.round(Number(v) * 100)} %`,
      },
    });

    updateDevice({ id: "dev1", params: [{ name: "Dry/Wet", value: "50" }] });

    expect(expectValueSet(param)).toBeCloseTo(0.5, 1);
  });

  it("warn-skips a param whose resolution throws and still applies later params", () => {
    // Drum rack with no chains. Addressing a far-out chain index (c20) forces
    // auto-creating past the cap, which throws. Each param is try-isolated, so
    // the bad one must not abort the following (good) param in the same call.
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        chains: [],
        can_have_drum_pads: 1,
        parameters: children("macro-param"),
      },
    });
    const macro = registerMockObject("macro-param", {
      properties: {
        name: "Macro 1",
        original_name: "Macro 1",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (v: unknown) => `${Number(v)} %` },
    });

    updateDevice({
      path: "t0/d0",
      params: [
        { name: "pC1/c20/sample", value: "/x.wav" }, // throws (exceeds chain cap)
        { name: "Macro 1", value: "0.5" }, // must still be applied
      ],
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("failed to set param"),
    );
    expect(expectValueSet(macro)).toBeCloseTo(0.5, 1);
  });
});

describe("updateDevice - pad instrument guard", () => {
  it("skips a sample write onto a pad instrument and keeps the device", () => {
    const chain = registerDrumRackWithDrumSamplerOnC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/d0/sample", value: "/snare.wav" }],
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("sample write SKIPPED on pad t0/d0/pC1"),
    );
    expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
    expect(chain.call).not.toHaveBeenCalledWith("insert_device", "Simpler");
  });

  it("swaps the instrument for a Simpler and loads the sample under force", () => {
    const chain = registerDrumRackWithDrumSamplerOnC1();

    updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/d0/sample", value: "/snare.wav" }],
      force: true,
    });

    expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    expect(LiveAPI.from("id new-simpler").call).toHaveBeenCalledWith(
      "replace_sample",
      "/snare.wav",
    );
  });
});
