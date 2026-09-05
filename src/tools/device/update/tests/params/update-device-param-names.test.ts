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

  it("reports an unresolvable non-integer key in the entry and a warning", () => {
    const result = updateDevice({
      id: "123",
      params: [{ name: "Nonexistent", value: "0.5" }],
    });

    expect(capturedWarnings()).toContain(
      'param "Nonexistent" not found on t0/d0 (id 123)',
    );
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/d0",
      params: [{ name: "Nonexistent", reason: "not found on t0/d0 (id 123)" }],
    });
  });
});

describe("updateDevice - a name that matches more than one param", () => {
  let bandwidth: RegisteredMockObject;
  let stereoWidth: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { parameters: children("94", "95") },
    });

    // Corpus really does expose two params called "Width": a filter bandwidth
    // and a stereo width.
    bandwidth = registerMockObject("94", {
      path: livePath.track(0).device(0).parameter(1),
      type: "DeviceParameter",
      properties: {
        name: "Width",
        original_name: "Width",
        is_quantized: 0,
        value: 5,
        min: 0.5,
        max: 9,
      },
      methods: { str_for_value: (v: unknown) => String(v) },
    });

    stereoWidth = registerMockObject("95", {
      path: livePath.track(0).device(0).parameter(2),
      type: "DeviceParameter",
      properties: {
        name: "Width",
        original_name: "Width",
        is_quantized: 0,
        value: 50,
        min: 0,
        max: 100,
      },
      methods: { str_for_value: (v: unknown) => `${String(v)} %` },
    });
  });

  it("writes neither of them", () => {
    updateDevice({ id: "123", params: [{ name: "Width", value: "5" }] });

    expect(bandwidth.set).not.toHaveBeenCalled();
    expect(stereoWidth.set).not.toHaveBeenCalled();
  });

  it("names the ids and ranges so the caller can pick one", () => {
    updateDevice({ id: "123", params: [{ name: "Width", value: "5" }] });

    expect(capturedWarnings()).toContain(
      'param "Width" names 2 params on t0/d0 (id 123) — ' +
        "id 94 (0.5 to 9), id 95 (0 % to 100 %) — so " +
        "nothing was written. Write by id to pick one.",
    );
  });

  it("still writes a param addressed by its id", () => {
    updateDevice({ id: "123", params: [{ name: "95", value: "80" }] });

    expect(stereoWidth.set).toHaveBeenCalledWith("value", 80);
  });

  it("keeps writing the other params in the same call", () => {
    registerMockObject("456", {
      path: livePath.track(0).device(1),
      type: "Device",
      properties: { parameters: children("94", "95", "p-dry") },
    });

    const dryWet = registerMockObject("p-dry", {
      properties: {
        name: "Dry/Wet",
        original_name: "Dry/Wet",
        is_quantized: 0,
        value: 50,
        min: 0,
        max: 100,
      },
      methods: { str_for_value: (v: unknown) => `${String(v)} %` },
    });

    updateDevice({
      id: "456",
      params: [
        { name: "Width", value: "5" },
        { name: "Dry/Wet", value: "80" },
      ],
    });

    expect(dryWet.set).toHaveBeenCalledWith("value", 80);
  });
});

describe("updateDevice - two rack macros renamed the same", () => {
  let macro1: RegisteredMockObject;
  let macro2: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { parameters: children("m1", "m2") },
    });

    // Live lets two macros carry the same name. Only the raw names collide —
    // read-device names them apart by their original_name.
    macro1 = registerMockObject("m1", {
      properties: {
        name: "Drive",
        original_name: "Macro 1",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 127,
      },
      methods: { str_for_value: (v: unknown) => String(v) },
    });

    macro2 = registerMockObject("m2", {
      properties: {
        name: "Drive",
        original_name: "Macro 2",
        is_quantized: 0,
        value: 0,
        min: 0,
        max: 127,
      },
      methods: { str_for_value: (v: unknown) => String(v) },
    });
  });

  it("writes neither when addressed by the name they share", () => {
    updateDevice({ id: "123", params: [{ name: "Drive", value: "42" }] });

    expect(macro1.set).not.toHaveBeenCalled();
    expect(macro2.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toContain(
      'param "Drive" names 2 params on t0/d0 (id 123) — ' +
        "id m1 (0 to 127), id m2 (0 to 127) — so nothing was written. " +
        "Write by id to pick one.",
    );
  });

  it("writes the one named by the name read-device reports", () => {
    updateDevice({
      id: "123",
      params: [{ name: "Drive (Macro 2)", value: "42" }],
    });

    expect(macro2.set).toHaveBeenCalledWith("value", 42);
    expect(macro1.set).not.toHaveBeenCalled();
  });

  it("matches that name case-insensitively too", () => {
    updateDevice({
      id: "123",
      params: [{ name: "drive (macro 1)", value: "42" }],
    });

    expect(macro1.set).toHaveBeenCalledWith("value", 42);
    expect(macro2.set).not.toHaveBeenCalled();
  });
});
