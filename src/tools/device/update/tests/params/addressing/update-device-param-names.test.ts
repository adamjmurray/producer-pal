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
  noParamLanded,
  paramsOf,
  registerContinuousParam,
  registerMockObject,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Register the device under test at t0/d0, holding the given params.
 * @param paramIds - Parameter mock ids, in the device's parameter order
 */
function registerDevice(...paramIds: string[]): void {
  registerMockObject("123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children(...paramIds) },
  });
}

describe("updateDevice - params by name", () => {
  let paramFreq: RegisteredMockObject;
  let paramMacro: RegisteredMockObject;

  beforeEach(() => {
    registerDevice("p-freq", "p-macro");

    paramFreq = registerContinuousParam("p-freq", {
      name: "Filter Freq",
      value: 500,
      min: 20,
      max: 20000,
      display: (v) => `${String(v)} Hz`,
    });

    paramMacro = registerContinuousParam("p-macro", {
      name: "Reverb",
      originalName: "Macro 1",
      value: 0.5,
      // Coarse like a real label, so Live's float rounding reads as landed.
      display: (v) => Number(v).toFixed(2),
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
    const paramDigits = registerContinuousParam("p-digits", {
      name: 5678,
      value: 1,
      display: (v) => String(v),
    });

    registerDevice("p-freq", "p-macro", "p-digits");

    updateDevice({ id: "123", params: [{ name: "5678", value: "0.5" }] });

    expect(paramDigits.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("formats a param with no original_name as 'name ()', not 'name (undefined)'", () => {
    // A param with no original_name property reads back undefined from
    // getProperty. The formatted-name fallback must read that as "" — if it
    // read "undefined" instead, this search would find nothing.
    const paramNoOriginal = registerContinuousParam("p-no-original", {
      name: "Drive",
      omitOriginalName: true,
      value: 0.2,
      display: (v) => String(v),
    });

    registerDevice("p-freq", "p-macro", "p-no-original");

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

  it("reports an unresolvable non-integer key in the error, and warns nowhere", () => {
    const message = noParamLanded(() =>
      updateDevice({
        id: "123",
        params: [{ name: "Nonexistent", value: "0.5" }],
      }),
    );

    expect(message).toBe(
      'no param landed — "Nonexistent": not found on t0/d0 (id 123)',
    );
    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("updateDevice - a name that matches more than one param", () => {
  let bandwidth: RegisteredMockObject;
  let stereoWidth: RegisteredMockObject;

  beforeEach(() => {
    registerDevice("94", "95");

    // Corpus really does expose two params called "Width": a filter bandwidth
    // and a stereo width.
    bandwidth = registerContinuousParam("94", {
      index: 1,
      name: "Width",
      value: 5,
      min: 0.5,
      max: 9,
      display: (v) => String(v),
    });

    stereoWidth = registerContinuousParam("95", {
      index: 2,
      name: "Width",
      value: 50,
      max: 100,
      display: (v) => `${String(v)} %`,
    });
  });

  it("writes neither of them", () => {
    noParamLanded(() =>
      updateDevice({ id: "123", params: [{ name: "Width", value: "5" }] }),
    );

    expect(bandwidth.set).not.toHaveBeenCalled();
    expect(stereoWidth.set).not.toHaveBeenCalled();
  });

  it("names the ids and ranges so the caller can pick one", () => {
    const message = noParamLanded(() =>
      updateDevice({ id: "123", params: [{ name: "Width", value: "5" }] }),
    );

    expect(message).toBe(
      'no param landed — "Width": names 2 params on t0/d0 (id 123) — ' +
        "id 94 (0.5 to 9), id 95 (0 % to 100 %) — so " +
        "nothing was written. Send {id, value} to pick one.",
    );
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("reports an ambiguous name sent twice once per entry", () => {
    const message = noParamLanded(() =>
      updateDevice({
        id: "123",
        params: [
          { name: "Width", value: "5" },
          { name: "width", value: "6" },
        ],
      }),
    );

    expect(message).toMatch(
      /^no param landed — "Width": set again by "width" later in the list; "width": names 2 params /,
    );
    expect(bandwidth.set).not.toHaveBeenCalled();
    expect(stereoWidth.set).not.toHaveBeenCalled();
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

    const dryWet = registerContinuousParam("p-dry", {
      name: "Dry/Wet",
      value: 50,
      max: 100,
      display: (v) => `${String(v)} %`,
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
      const param = registerContinuousParam(id, {
        index: Number(id) - 93,
        name: "Dry/Wet",
        value: 50,
        max: 100,
        display: (v) => `${String(v)} %`,
      });

      expect(param.set).not.toHaveBeenCalled();
    }

    expectParamRefused(
      () =>
        updateDevice({ id: "123", params: [{ name: "Dry/Wet", value: "80" }] }),
      "Dry/Wet",
      "names 2 params on t0/d0 (id 123) — id 94 (0 % to 100 %), " +
        "id 95 (0 % to 100 %) — so nothing was written. Send {id, value} to pick one.",
    );
  });
});

describe("updateDevice - two rack macros renamed the same", () => {
  let macro1: RegisteredMockObject;
  let macro2: RegisteredMockObject;

  beforeEach(() => {
    registerDevice("m1", "m2");

    // Live lets two macros carry the same name. Only the raw names collide —
    // read-device names them apart by their original_name.
    macro1 = registerContinuousParam("m1", {
      name: "Drive",
      originalName: "Macro 1",
      max: 127,
      display: (v) => String(v),
    });

    macro2 = registerContinuousParam("m2", {
      name: "Drive",
      originalName: "Macro 2",
      max: 127,
      display: (v) => String(v),
    });
  });

  it("writes neither when addressed by the name they share", () => {
    const message = noParamLanded(() =>
      updateDevice({ id: "123", params: [{ name: "Drive", value: "42" }] }),
    );

    expect(macro1.set).not.toHaveBeenCalled();
    expect(macro2.set).not.toHaveBeenCalled();
    expect(message).toBe(
      'no param landed — "Drive": names 2 params on t0/d0 (id 123) — ' +
        "id m1 (0 to 127), id m2 (0 to 127) — so nothing was written. " +
        "Send {id, value} to pick one.",
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
    const message = noParamLanded(() =>
      updateDevice({
        id: "124",
        params: [{ name: "Device On", value: "peak" }],
      }),
    );

    expect(deviceOn.set).not.toHaveBeenCalledWith("value", expect.anything());
    expect(message).toBe(
      'no param landed — "Device On": "peak" is not valid. Options: Off, On',
    );
    expect(capturedWarnings()).toHaveLength(0);
  });
});

// When entries reach one param, the last wins and each earlier one is skipped.
describe("updateDevice - one param named twice", () => {
  let paramThreshold: RegisteredMockObject;
  let paramMacro1: RegisteredMockObject;

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

    paramMacro1 = registerMockObject("p-macro-1", {
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

  it("writes only the last of the same name in different case", () => {
    const result = updateDevice({
      id: "125",
      params: [
        { name: "Threshold", value: "0.2" },
        { name: "threshold", value: "0.8" },
      ],
    });

    expect(paramThreshold.set).toHaveBeenCalledTimes(1);
    expect(paramThreshold.set).toHaveBeenCalledWith("value", 0.8);
    expect(paramsOf(result)).toStrictEqual([
      {
        name: "Threshold",
        ok: false,
        detail: 'set again by "threshold" later in the list',
      },
      { id: "789", name: "Threshold" },
    ]);
  });

  it("writes only the last of three entries reaching one param", () => {
    const result = updateDevice({
      id: "125",
      params: [
        { name: "Threshold", value: "0.2" },
        { name: "789", value: "0.4" },
        { name: "threshold", value: "0.8" },
      ],
    });

    expect(paramThreshold.set).toHaveBeenCalledTimes(1);
    expect(paramThreshold.set).toHaveBeenCalledWith("value", 0.8);
    expect(paramsOf(result).slice(0, 2)).toStrictEqual([
      {
        name: "Threshold",
        ok: false,
        detail: 'set again by "threshold" later in the list',
      },
      {
        name: "789",
        ok: false,
        detail: 'set again by "threshold" later in the list',
      },
    ]);
  });

  // A rack macro answers to its own name and to the "name (original_name)"
  // form read-device reports it by.
  it("writes only the last of a macro's two spellings", () => {
    const result = updateDevice({
      id: "125",
      params: [
        { name: "Reverb", value: "0.2" },
        { name: "Reverb (Macro 1)", value: "0.8" },
        { name: "Threshold", value: "0.4" },
      ],
    });

    expect(paramsOf(result)[0]).toStrictEqual({
      name: "Reverb",
      ok: false,
      detail: 'set again by "Reverb (Macro 1)" later in the list',
    });
    expect(paramMacro1.set).toHaveBeenCalledTimes(1);
    expect(paramMacro1.set).toHaveBeenCalledWith("value", 0.8);
    expect(paramThreshold.set).toHaveBeenCalledWith("value", 0.4);
  });

  // Two misses with one key: the last reports the miss, the first is skipped.
  it("skips an earlier copy of a name that reaches nothing", () => {
    const message = noParamLanded(() =>
      updateDevice({
        id: "125",
        params: [
          { name: "Nope", value: "0.2" },
          { name: "nope", value: "0.8" },
        ],
      }),
    );

    expect(message).toMatch(
      /^no param landed — "Nope": set again by "nope" later in the list; "nope": not found/,
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
