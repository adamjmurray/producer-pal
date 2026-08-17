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
  updateDevice,
} from "../update-device-test-helpers.ts";

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
    methods: { str_for_value: (value: unknown) => String(value) },
  });
}

// A macro mapping makes its target report is_enabled 0. Live still accepts the
// set, reports success, and ignores it, so an unguarded write would tell the
// model the param changed when nothing happened.
describe("updateDevice - disabled params", () => {
  it("warns and skips a param a rack macro controls", () => {
    const param = registerParam(0);

    updateDevice({ ids: "dev1", params: [{ name: "Volume", value: "0.8" }] });

    expect(param.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('updateDevice: param "Volume" is disabled'),
    );
  });

  it("writes the param when nothing is mapped to it", () => {
    const param = registerParam(1);

    updateDevice({ ids: "dev1", params: [{ name: "Volume", value: "0.8" }] });

    expect(param.set).toHaveBeenCalledWith("value", 0.8);
    expect(outlet).not.toHaveBeenCalled();
  });
});
