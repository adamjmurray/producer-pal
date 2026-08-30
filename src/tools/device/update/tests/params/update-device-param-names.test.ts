// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - params by name", () => {
  let paramFreq: RegisteredMockObject;
  let paramMacro: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        parameters: children("p-freq", "p-macro"),
      },
    });

    paramFreq = registerMockObject("p-freq", {
      properties: {
        name: "Filter Freq",
        original_name: "Filter Freq",
        is_quantized: 0,
        value: 500,
        min: 20,
        max: 20000,
      },
      methods: { str_for_value: (v: unknown) => `${String(v)} Hz` },
    });

    paramMacro = registerMockObject("p-macro", {
      properties: {
        name: "Reverb",
        original_name: "Macro 1",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (v: unknown) => String(v) },
    });
  });

  it("should resolve param by exact name", () => {
    updateDevice({
      id: "123",
      params: [{ name: "Filter Freq", value: "1000" }],
    });

    expect(paramFreq.set).toHaveBeenCalledWith("value", 1000);
  });

  it("should resolve param by name case-insensitively", () => {
    updateDevice({
      id: "123",
      params: [{ name: "filter freq", value: "1000" }],
    });

    expect(paramFreq.set).toHaveBeenCalledWith("value", 1000);
  });

  it("should resolve rack macro by raw name", () => {
    updateDevice({ id: "123", params: [{ name: "Reverb", value: "0.8" }] });

    expect(paramMacro.set).toHaveBeenCalledWith("value", 0.8);
  });

  it("should resolve rack macro by formatted name", () => {
    updateDevice({
      id: "123",
      params: [{ name: "Reverb (Macro 1)", value: "0.8" }],
    });

    expect(paramMacro.set).toHaveBeenCalledWith("value", 0.8);
  });

  it("should resolve multiple params by name", () => {
    updateDevice({
      id: "123",
      params: [
        { name: "Filter Freq", value: "1000" },
        { name: "Reverb", value: "0.8" },
      ],
    });

    expect(paramFreq.set).toHaveBeenCalledWith("value", 1000);
    expect(paramMacro.set).toHaveBeenCalledWith("value", 0.8);
  });

  it("should warn for unresolvable non-integer key", () => {
    updateDevice({
      id: "123",
      params: [{ name: "Nonexistent", value: "0.5" }],
    });

    expect(capturedWarnings()).toContain(
      'updateDevice: param "Nonexistent" not found on device',
    );
  });
});
