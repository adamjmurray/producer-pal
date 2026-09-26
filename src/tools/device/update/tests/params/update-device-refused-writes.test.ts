// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
  registerSimplerDevice,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Register a device with one continuous param, enabled or macro-mapped
 * @param isEnabled - The param's is_enabled value
 * @returns The registered param mock
 */
function registerParam(isEnabled: number): RegisteredMockObject {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children("vol") },
  });

  return registerMockObject("vol", {
    properties: {
      name: "Volume",
      original_name: "Volume",
      is_quantized: 0,
      is_enabled: isEnabled,
      value: 0.5,
      min: 0,
      max: 1,
    },
    // Two decimals, like a real display — see registerParamMock.
    methods: { str_for_value: (value: unknown) => Number(value).toFixed(2) },
  });
}

// A macro mapping makes its target report is_enabled 0. Live still accepts the
// set, reports success, and ignores it, so an unguarded write would tell the
// model the param changed when nothing happened.
describe("updateDevice - disabled params", () => {
  it("refuses a lone param a rack macro controls, naming it", () => {
    const param = registerParam(0);

    expect(() =>
      updateDevice({ id: "dev1", params: [{ name: "Volume", value: "0.8" }] }),
    ).toThrow('no param landed — "Volume": is disabled and was not changed');
    expect(param.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("writes the param when nothing is mapped to it", () => {
    const param = registerParam(1);

    updateDevice({ id: "dev1", params: [{ name: "Volume", value: "0.8" }] });

    expect(param.set).toHaveBeenCalledWith("value", 0.8);
    expect(capturedWarnings()).toHaveLength(0);
  });
});

const DISABLED = "is disabled and was not changed";

/**
 * Register two devices whose one "Volume" param a rack macro owns.
 */
function registerMappedDevices(): void {
  for (const index of [0, 1]) {
    registerMockObject(`dev-${index}`, {
      path: livePath.track(0).device(index),
      type: "Device",
      properties: { parameters: children(`vol-${index}`) },
    });
    registerMockObject(`vol-${index}`, {
      properties: {
        name: "Volume",
        original_name: "Volume",
        is_quantized: 0,
        is_enabled: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
    });
  }
}

// When every nested write (a param, an action) failed and nothing else was
// asked of the target, nothing landed: the target is ok:false in a list, and a
// lone one throws naming each write that failed.
describe("updateDevice - every param failed", () => {
  it("throws for a lone device, naming each param", () => {
    registerMappedDevices();

    expect(() =>
      updateDevice({
        id: "dev-0",
        params: [
          { name: "Volume", value: "0.8" },
          { name: "Nope", value: "1" },
        ],
      }),
    ).toThrow(/^no param landed — "Volume": is disabled .*; "Nope": /);
  });

  it("keeps a device's slot as ok:false in a list", () => {
    registerMappedDevices();

    expect(
      updateDevice({
        id: "dev-0,dev-1",
        params: [{ name: "Volume", value: "1" }],
      }),
    ).toStrictEqual([
      {
        id: "dev-0",
        ok: false,
        detail: expect.stringMatching(/^no param landed — "Volume": /),
      },
      {
        id: "dev-1",
        ok: false,
        detail: expect.stringContaining(DISABLED),
      },
    ]);
  });

  it("keeps the hit and its failed params when a name landed", () => {
    registerMappedDevices();

    expect(
      updateDevice({
        id: "dev-0",
        name: "Bass",
        params: [{ name: "Volume", value: "0.8" }],
      }),
    ).toStrictEqual({
      id: "dev-0",
      path: "t0/d0",
      params: [
        {
          name: "Volume",
          ok: false,
          detail: expect.stringContaining(DISABLED),
        },
      ],
    });
  });

  it("throws for a lone chain sent only params it has no use for", () => {
    registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
    });

    expect(() =>
      updateDevice({ id: "chain-0", params: [{ name: "Volume", value: "1" }] }),
    ).toThrow(/^no param landed — "Volume": 'params' not applicable/);
  });
});

describe("updateDevice - every action failed", () => {
  it("throws for a lone device, naming each action", () => {
    registerSimplerDevice();

    expect(() =>
      updateDevice({ id: "simpler-1", actions: ["nope", "warpAs(x)"] }),
    ).toThrow(
      'no action landed — "nope": unknown action for this device; "warpAs(x)": requires a numeric beats argument',
    );
  });

  it("keeps the hit when one action ran", () => {
    registerSimplerDevice();

    expect(
      updateDevice({ id: "simpler-1", actions: ["crop", "nope"] }),
    ).toStrictEqual({
      id: "simpler-1",
      path: "t0/d0",
      actions: [
        { action: "crop" },
        { action: "nope", ok: false, detail: "unknown action for this device" },
      ],
    });
  });
});
