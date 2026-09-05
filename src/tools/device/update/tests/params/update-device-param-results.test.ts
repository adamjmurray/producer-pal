// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerDeviceWithParams,
  registerMockObject,
  registerSimplerDevice,
  updateDevice,
} from "../update-device-test-helpers.ts";

// Glue Compressor's Attack: seven reachable values across a range that looks
// continuous, so a request between steps lands on one of them.
const ATTACK_STEPS = [0.01, 0.1, 0.3, 1, 3, 10, 30];

/**
 * Register a device at t0/d0 holding one param with a coarse value ladder.
 * @returns The param mock
 */
function registerLadderParam(): RegisteredMockObject {
  registerDeviceWithParams("attack");

  return registerMockObject("attack", {
    properties: {
      name: "Attack",
      original_name: "Attack",
      is_quantized: 0,
      value: 0,
      min: 0,
      max: 1,
    },
    methods: {
      str_for_value: (v: unknown) => {
        const index = Math.min(
          ATTACK_STEPS.length - 1,
          Math.floor(Number(v) * ATTACK_STEPS.length),
        );

        return `${ATTACK_STEPS[index]} ms`;
      },
    },
  });
}

describe("updateDevice - written param values", () => {
  it("reports the step the requested value snapped to", () => {
    registerLadderParam();

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Attack", value: "12 ms" }],
    });

    // 12 ms is not reachable — the response says where it landed instead.
    expect(result).toStrictEqual({
      id: "dev1",
      path: "t0/d0",
      params: [{ id: "attack", name: "Attack", value: 10 }],
    });
  });

  it("names a path-prefixed param by the path it was addressed with", () => {
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
    });
    registerMockObject("chain-c1", {
      type: "DrumChain",
      properties: { in_note: 36, devices: children("pad-dev") },
    });
    registerMockObject("pad-dev", {
      type: "Device",
      properties: { parameters: children("pad-vol") },
    });
    registerMockObject("pad-vol", {
      properties: {
        name: "Volume",
        original_name: "Volume",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (v: unknown) => `${Math.round(Number(v) * 100)} %`,
      },
    });

    const result = updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/d0/Volume", value: "50" }],
    });

    expect(result).toStrictEqual({
      id: "drum-rack",
      path: "t0/d0",
      params: [{ id: "pad-vol", name: "pC1/d0/Volume", value: 50 }],
    });
  });

  // A list that came back a name short is one the caller has to diff against
  // its own request to read, so every entry it sent comes back.
  it("reports the param that named nothing beside the ones that landed", () => {
    registerLadderParam();

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "Nope", value: "1" },
        { name: "Attack", value: "12 ms" },
      ],
    });

    expect(result).toStrictEqual({
      id: "dev1",
      path: "t0/d0",
      params: [
        { name: "Nope", reason: "not found on t0/d0 (id dev1)" },
        { id: "attack", name: "Attack", value: 10 },
      ],
    });
  });

  // The entry sits in the rack's result, but the lookup happened on the pad's
  // own device, so "this device" would name the wrong one.
  it("names the device a path-prefixed miss was looked up on", () => {
    registerMockObject("drum-rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
    });
    registerMockObject("chain-c1", {
      type: "DrumChain",
      properties: { in_note: 36, devices: children("pad-dev") },
    });
    registerMockObject("pad-dev", {
      path: `${livePath.track(0).device(0)} chains 0 devices 0`,
      type: "Device",
      properties: { parameters: children() },
    });

    const result = updateDevice({
      path: "t0/d0",
      params: [{ name: "pC1/d0/Cutoff", value: "50" }],
    });

    expect(result).toStrictEqual({
      id: "drum-rack",
      path: "t0/d0",
      params: [
        {
          name: "pC1/d0/Cutoff",
          reason: "not found on t0/d0/c0/d0 (id pad-dev)",
        },
      ],
    });
  });

  it("reports every param when none of them named anything", () => {
    registerLadderParam();

    const result = updateDevice({
      id: "dev1",
      params: [
        { name: "Nope", value: "1" },
        { name: "Also nope", value: "2" },
      ],
    });

    expect(result).toStrictEqual({
      id: "dev1",
      path: "t0/d0",
      params: [
        { name: "Nope", reason: "not found on t0/d0 (id dev1)" },
        { name: "Also nope", reason: "not found on t0/d0 (id dev1)" },
      ],
    });
  });

  it("reports where an out-of-range value landed, not the one asked for", () => {
    registerLadderParam();

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Attack", value: "5000 ms" }],
    });

    // The ladder tops out at 30 ms, and that is what the entry says.
    expect(result).toStrictEqual({
      id: "dev1",
      path: "t0/d0",
      params: [{ id: "attack", name: "Attack", value: 30 }],
    });
  });

  it("reports nothing for a write Live ignored", () => {
    const param = registerLadderParam();

    // Live drops a value it doesn't like without saying so, leaving the old
    // one in place. An entry only ever reports a value that landed.
    param.set.mockImplementation(() => undefined);

    const result = updateDevice({
      id: "dev1",
      params: [{ name: "Attack", value: "12 ms" }],
    });

    expect(result).toStrictEqual({ id: "dev1", path: "t0/d0" });
  });

  it("reads params back after a macro variation recall overwrites them", () => {
    const macro = registerMockObject("macro-1", {
      properties: {
        name: "Macro 1",
        original_name: "Macro 1",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 1,
      },
      methods: {
        str_for_value: (v: unknown) => `${Math.round(Number(v) * 100)} %`,
      },
    });

    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_chains: 1,
        variation_count: 3,
        selected_variation_index: 0,
        parameters: children("macro-1"),
      },
      // A recall restores the stored macro values over what was just written.
      methods: {
        recall_selected_variation: () => {
          macro.properties.value = 0.9;
        },
      },
    });

    const result = updateDevice({
      id: "rack",
      params: [{ name: "Macro 1", value: "50" }],
      macroVariation: "load",
      macroVariationIndex: 0,
    });

    // 50 is what the write landed; 90 is what the same call left behind.
    expect(result).toStrictEqual({
      id: "rack",
      path: "t0/d0",
      params: [{ id: "macro-1", name: "Macro 1", value: 90 }],
    });
  });

  it("reports nothing for a specialized pseudo-param write", () => {
    // `sample` is not a DeviceParameter, so there is no value to read back.
    registerSimplerDevice();

    const result = updateDevice({
      id: "simpler-1",
      params: [{ name: "sample", value: "/snare.wav" }],
    });

    expect(result).toStrictEqual({ id: "simpler-1", path: "t0/d0" });
  });
});
