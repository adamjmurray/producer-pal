// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  expectParamRefused,
  livePath,
  paramsOf,
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

  it("resolves a param whose name is all-digit (Live reports it as a number)", () => {
    // `.toLowerCase()` on that used to throw during the name match.
    const paramDigits = registerMockObject("p-digits", {
      properties: {
        name: 5678,
        original_name: 5678,
        is_quantized: 0,
        value: 1,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (v: unknown) => String(v) },
    });

    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        parameters: children("p-freq", "p-macro", "p-digits"),
      },
    });

    updateDevice({ id: "123", params: [{ name: "5678", value: "0.5" }] });

    expect(paramDigits.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("formats a param with no original_name as 'name ()', not 'name (undefined)'", () => {
    // A param with no original_name property reads back undefined from
    // getProperty. The formatted-name fallback must read that as "" — if it
    // read "undefined" instead, this search would find nothing.
    const paramNoOriginal = registerMockObject("p-no-original", {
      properties: {
        name: "Drive",
        is_quantized: 0,
        value: 0.2,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (v: unknown) => String(v) },
    });

    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        parameters: children("p-freq", "p-macro", "p-no-original"),
      },
    });

    updateDevice({ id: "123", params: [{ name: "Drive ()", value: "1" }] });

    expect(paramNoOriginal.set).toHaveBeenCalledWith("value", 1);
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

  it("reports an unresolvable non-integer key in its entry, and warns nowhere", () => {
    const result = updateDevice({
      id: "123",
      params: [{ name: "Nonexistent", value: "0.5" }],
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/d0",
      params: [
        {
          name: "Nonexistent",
          ok: false,
          reason: "not found on t0/d0 (id 123)",
        },
      ],
    });
    expect(capturedWarnings()).toHaveLength(0);
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
    const result = updateDevice({
      id: "123",
      params: [{ name: "Width", value: "5" }],
    });

    expect(paramsOf(result)).toStrictEqual([
      {
        name: "Width",
        ok: false,
        reason:
          "names 2 params on t0/d0 (id 123) — " +
          "id 94 (0.5 to 9), id 95 (0 % to 100 %) — so " +
          "nothing was written. Write by id to pick one.",
      },
    ]);
    expect(capturedWarnings()).toHaveLength(0);
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

  // A slash-named param is resolved by name before the name is read as a path,
  // so this ambiguity is a second code path with the same answer.
  it("refuses a slash-named param two params answer to", () => {
    for (const id of ["94", "95"]) {
      const param = registerMockObject(id, {
        path: livePath
          .track(0)
          .device(0)
          .parameter(Number(id) - 93),
        type: "DeviceParameter",
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

      expect(param.set).not.toHaveBeenCalled();
    }

    const result = updateDevice({
      id: "123",
      params: [{ name: "Dry/Wet", value: "80" }],
    });

    expectParamRefused(
      result,
      "Dry/Wet",
      "names 2 params on t0/d0 (id 123) — id 94 (0 % to 100 %), " +
        "id 95 (0 % to 100 %) — so nothing was written. Write by id to pick one.",
    );
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
    const result = updateDevice({
      id: "123",
      params: [{ name: "Drive", value: "42" }],
    });

    expect(macro1.set).not.toHaveBeenCalled();
    expect(macro2.set).not.toHaveBeenCalled();
    expect(paramsOf(result)).toStrictEqual([
      {
        name: "Drive",
        ok: false,
        reason:
          "names 2 params on t0/d0 (id 123) — " +
          "id m1 (0 to 127), id m2 (0 to 127) — so nothing was written. " +
          "Write by id to pick one.",
      },
    ]);
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

describe("updateDevice - enum values", () => {
  let warpMode: RegisteredMockObject;
  let deviceOn: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("124", {
      path: livePath.track(0).device(1),
      type: "Device",
      properties: {
        parameters: children("p-warp", "p-on"),
      },
    });

    warpMode = registerMockObject("p-warp", {
      properties: {
        name: "Warp Mode",
        original_name: "Warp Mode",
        is_quantized: 1,
        value_items: ["Repitch", "Fade", "Jump"],
      },
    });

    deviceOn = registerMockObject("p-on", {
      properties: {
        name: "Device On",
        original_name: "Device On",
        is_quantized: 1,
        value_items: ["Off", "On"],
      },
    });
  });

  it("matches an option case-insensitively", () => {
    const result = updateDevice({
      id: "124",
      params: [{ name: "Warp Mode", value: "fade" }],
    });

    expect(warpMode.set).toHaveBeenCalledWith("value", 1);
    expect(result).toStrictEqual({
      id: "124",
      path: "t0/d1",
      params: [{ id: "p-warp", name: "Warp Mode", value: "Fade" }],
    });
  });

  // The result reports the label read back from the device, not the caller's
  // spelling — a write only ever echoes what the API confirms.
  it.each([
    ["On", 1, "On"],
    ["on", 1, "On"],
    ["true", 1, "On"],
    ["1", 1, "On"],
    ["Off", 0, "Off"],
    ["off", 0, "Off"],
    ["false", 0, "Off"],
    ["0", 0, "Off"],
  ])("accepts %s on an Off/On param as index %i", (value, index, label) => {
    const result = updateDevice({
      id: "124",
      params: [{ name: "Device On", value }],
    });

    expect(deviceOn.set).toHaveBeenCalledWith("value", index);
    expect(result).toStrictEqual({
      id: "124",
      path: "t0/d1",
      params: [{ id: "p-on", name: "Device On", value: label }],
    });
  });

  it("still refuses a value that names neither state", () => {
    const result = updateDevice({
      id: "124",
      params: [{ name: "Device On", value: "peak" }],
    });

    expect(deviceOn.set).not.toHaveBeenCalledWith("value", expect.anything());
    expect(result).toStrictEqual({
      id: "124",
      path: "t0/d1",
      params: [
        {
          name: "Device On",
          ok: false,
          reason: '"peak" is not valid. Options: Off, On',
        },
      ],
    });
    expect(capturedWarnings()).toHaveLength(0);
  });
});

// Values are read back once after every write in the call lands, keyed by the
// param, so two entries reaching one param would report the last write's value
// for both. The call is refused instead, before anything is written.
describe("updateDevice - one param named twice", () => {
  let paramThreshold: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("125", {
      path: livePath.track(0).device(2),
      type: "Device",
      properties: { parameters: children("789", "p-macro-1") },
    });

    paramThreshold = registerMockObject("789", {
      path: livePath.track(0).device(2).parameter(0),
      type: "DeviceParameter",
      properties: {
        name: "Threshold",
        original_name: "Threshold",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
    });

    registerMockObject("p-macro-1", {
      path: livePath.track(0).device(2).parameter(1),
      type: "DeviceParameter",
      properties: {
        name: "Reverb",
        original_name: "Macro 1",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
    });
  });

  it("refuses the same name twice", () => {
    expect(() =>
      updateDevice({
        id: "125",
        params: [
          { name: "Threshold", value: "0.2" },
          { name: "Threshold", value: "0.8" },
        ],
      }),
    ).toThrow('params entry "Threshold" is set more than once');
  });

  it("refuses the same name in different case", () => {
    expect(() =>
      updateDevice({
        id: "125",
        params: [
          { name: "Threshold", value: "0.2" },
          { name: "threshold", value: "0.8" },
        ],
      }),
    ).toThrow('params entry "threshold" is set more than once');
  });

  // Comparing the text can't see this one — the two spellings are the same
  // param, so the refusal names both.
  it("refuses a param named once by id and once by name", () => {
    expect(() =>
      updateDevice({
        id: "125",
        params: [
          { name: "789", value: "0.2" },
          { name: "Threshold", value: "0.8" },
        ],
      }),
    ).toThrow(
      'params entry "Threshold" is set more than once — "789" names the same param (id 789)',
    );
    expect(paramThreshold.set).not.toHaveBeenCalled();
  });

  // A rack macro answers to its own name and to the "name (original_name)"
  // form read-device reports it by.
  it("refuses a macro named by both of its spellings", () => {
    expect(() =>
      updateDevice({
        id: "125",
        params: [
          { name: "Reverb", value: "0.2" },
          { name: "Reverb (Macro 1)", value: "0.8" },
        ],
      }),
    ).toThrow(
      'params entry "Reverb (Macro 1)" is set more than once — "Reverb" names the same param (id p-macro-1)',
    );
  });

  // An id that reaches no param of this device is written nowhere, so it is
  // not the same param as anything else the call named.
  it("allows an id that reaches nothing alongside a name", () => {
    updateDevice({
      id: "125",
      params: [
        { name: "999", value: "0.2" },
        { name: "Threshold", value: "0.8" },
      ],
    });

    expect(paramThreshold.set).toHaveBeenCalledWith("value", 0.8);
  });
});
