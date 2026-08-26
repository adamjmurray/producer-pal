// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  expectValueSet,
  livePath,
  registerMockObject,
  registerSimplerDevice,
  updateDevice,
} from "../update-device-test-helpers.ts";

/**
 * Register a device holding one 0–1 continuous param whose min/max labels are
 * numeric Hz (so the setter takes the binary-search path) but whose mid-range
 * label is whatever the case wants to feed the parser.
 * @param paramId - Mock-registry id for the param object
 * @param name - The param's name, as `params: [{ name }]` addresses it
 * @param midLabel - The label returned for every value between the extremes
 * @returns The registered param mock
 */
function registerBinarySearchParam(
  paramId: string,
  name: string,
  midLabel: string,
): RegisteredMockObject {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children(paramId) },
  });

  return registerMockObject(paramId, {
    properties: {
      name,
      original_name: name,
      is_quantized: 0,
      value: 0.5,
      min: 0,
      max: 1,
    },
    methods: {
      str_for_value: (v: unknown) => {
        const n = Number(v);

        if (n <= 0.01) return "0 Hz";
        if (n >= 0.99) return "1000 Hz";

        return midLabel;
      },
    },
  });
}

describe("updateDevice - param value conversion", () => {
  describe("non-linear params (binary search)", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("env-param") },
      });
      // Simulate exponential envelope time: raw 0-1 → display 5-15000 ms
      param = registerMockObject("env-param", {
        properties: {
          name: "AEG1 Rel",
          original_name: "AEG1 Rel",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => {
            const display = 5 * Math.pow(15000 / 5, Number(v));

            return `${Math.round(display)} ms`;
          },
        },
      });
    });

    it("should find correct raw value via binary search", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "AEG1 Rel", value: "600" }],
      });

      const displayValue = 5 * Math.pow(15000 / 5, expectValueSet(param));

      expect(displayValue).toBeCloseTo(600, 0);
    });

    it("should handle target at min boundary", () => {
      updateDevice({ id: "dev1", params: [{ name: "AEG1 Rel", value: "5" }] });

      expect(expectValueSet(param)).toBeCloseTo(0, 1);
    });

    it("should handle target at max boundary", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "AEG1 Rel", value: "15000" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(1, 1);
    });
  });

  describe("unit normalization in binary search", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("time-param") },
      });
      param = registerMockObject("time-param", {
        properties: {
          name: "Decay",
          original_name: "Decay",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Switches between ms and s units depending on value
          str_for_value: (v: unknown) => {
            const ms = 1 + Number(v) * 9999;

            return ms >= 1000
              ? `${(ms / 1000).toFixed(2)} s`
              : `${Math.round(ms)} ms`;
          },
        },
      });
    });

    it("should handle s to ms unit normalization during binary search", () => {
      updateDevice({ id: "dev1", params: [{ name: "Decay", value: "5000" }] });

      expect(1 + expectValueSet(param) * 9999).toBeCloseTo(5000, -2);
    });
  });

  describe("unparseable labels fallback", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("weird-param") },
      });
      param = registerMockObject("weird-param", {
        properties: {
          name: "Special",
          original_name: "Special",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: () => "custom",
        },
      });
    });

    it("should fall back to raw value when min label is unparseable", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "Special", value: "0.7" }],
      });

      expect(param.set).toHaveBeenCalledWith("value", 0.7);
    });
  });

  describe("partially unparseable labels", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("half-param") },
      });
      param = registerMockObject("half-param", {
        properties: {
          name: "HalfParsed",
          original_name: "HalfParsed",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Min label is parseable but max label is not
          str_for_value: (v: unknown) =>
            Number(v) < 0.5 ? `${Number(v)} Hz` : "custom",
        },
      });
    });

    it("should fall back when max label is unparseable", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "HalfParsed", value: "0.3" }],
      });

      expect(param.set).toHaveBeenCalledWith("value", 0.3);
    });
  });

  describe("uninterpretable string input", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("str-param") },
      });
      param = registerMockObject("str-param", {
        properties: {
          name: "Mode",
          original_name: "Mode",
          is_quantized: 0,
          value: 0,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => String(v),
        },
      });
    });

    it("should warn and not write when string input can't be interpreted", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "Mode", value: "custom-value" }],
      });

      expect(param.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining('could not interpret "custom-value"'),
      );
    });
  });

  describe("binary search with mid-iteration unparseable label", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      // Min/max labels parseable (triggers binary search), but mid-range
      // label becomes unparseable.
      param = registerBinarySearchParam("flaky-param", "Flaky", "---");
    });

    it("should converge toward max when mid-range labels parse as NaN", () => {
      updateDevice({ id: "dev1", params: [{ name: "Flaky", value: "500" }] });

      // "---" parses as NaN (leading hyphens match the number regex). NaN
      // comparisons are always false, so the search never counts the target as
      // reached and walks up into the top step (0.99..1).
      expect(expectValueSet(param)).toBeCloseTo(0.995, 2);
    });
  });

  describe("resolve param by numeric ID", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children() },
      });
      param = registerMockObject("42", {
        properties: {
          name: "Volume",
          original_name: "Volume",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => `${Number(v)} dB`,
        },
      });
    });

    it("should resolve param via absolute numeric ID fallback", () => {
      updateDevice({ id: "dev1", params: [{ name: "42", value: "0.8" }] });

      expect(param.set).toHaveBeenCalledWith("value", 0.8);
    });
  });

  describe("resolve param registered at a relative device path", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      const devicePath = livePath.track(0).device(0);

      // Register param at the device-relative "parameters N" path
      param = registerMockObject("param3", {
        path: `${devicePath} parameters 3`,
        properties: {
          name: "Freq",
          original_name: "Freq",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => `${Number(v)} Hz`,
        },
      });

      registerMockObject("dev1", {
        path: devicePath,
        type: "Device",
        properties: { parameters: children("param3") },
      });
    });

    it("should resolve a param living under 'parameters N' by name", () => {
      // Param keys are either a name or an absolute numeric id — there is no
      // device-relative "parameters N" key form, so a param at that path is
      // reached by name like any other.
      updateDevice({ id: "dev1", params: [{ name: "Freq", value: "0.6" }] });

      expect(param.set).toHaveBeenCalledWith("value", 0.6);
    });
  });

  describe("note name out of MIDI range", () => {
    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("note-param") },
      });
      registerMockObject("note-param", {
        properties: {
          name: "Pitch",
          original_name: "Pitch",
          is_quantized: 0,
          value: 60,
          min: 0,
          max: 127,
        },
        methods: {
          str_for_value: (v: unknown) => `${Number(v)} Hz`,
        },
      });
    });

    it("should warn when note name is valid but out of MIDI range", () => {
      // C-3 is a valid note name but maps to MIDI note -12 (out of 0-127)
      updateDevice({ id: "dev1", params: [{ name: "Pitch", value: "C-3" }] });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining('invalid note name "C-3"'),
      );
    });
  });

  describe("binary search with string-valued label mid-iteration", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      // Min/max labels are numeric (triggers binary search), but mid-range
      // returns a note name (a string value from parseLabel).
      param = registerBinarySearchParam(
        "note-display-param",
        "NoteParam",
        "C4",
      );
    });

    it("should return mid when binary search encounters string-typed label", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "NoteParam", value: "500" }],
      });

      // "C4" parses as { value: "C4", unit: "note" } — a string value.
      // binarySearchRawValue returns mid immediately on string-typed labels.
      expect(expectValueSet(param)).toBe(0.5);
    });
  });

  describe("pan param with non-standard scale labels", () => {
    it("falls back to a 50 pan scale when neither min nor max label is parseable", () => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("pan-param") },
      });
      const param = registerMockObject("pan-param", {
        properties: {
          name: "Pan",
          original_name: "Pan",
          is_quantized: 0,
          value: 0,
          min: -1,
          max: 1,
        },
        methods: {
          // Current label "C" makes this a pan param, but the min/max labels
          // read "0L"/"0R" (extractMaxPanValue → 0, falsy), forcing the
          // `|| extractMaxPanValue(minLabel) || 50` chain down to the 50 default.
          str_for_value: (v: unknown) => {
            const n = Number(v);

            if (n === 1) return "0R";
            if (n === -1) return "0L";

            return "C";
          },
        },
      });

      updateDevice({ id: "dev1", params: [{ name: "Pan", value: "25R" }] });

      // normalizePan("25R", 50) = 0.5 → internal ((0.5+1)/2)*2 - 1 = 0.5
      expect(expectValueSet(param)).toBeCloseTo(0.5, 5);
    });
  });

  describe("division param with numeric str_for_value labels", () => {
    it("matches a division option when str_for_value returns a number", () => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("div-param") },
      });
      const param = registerMockObject("div-param", {
        properties: {
          name: "Div",
          original_name: "Div",
          is_quantized: 0,
          value: 1,
          min: 0,
          max: 4,
        },
        methods: {
          // min label "1/16" routes to the division branch; other values return
          // raw NUMBERs (not strings), exercising the number→String coercion in
          // findDivisionRawValue.
          str_for_value: (v: unknown) => (Number(v) === 0 ? "1/16" : Number(v)),
        },
      });

      updateDevice({ id: "dev1", params: [{ name: "Div", value: "2" }] });

      expect(param.set).toHaveBeenCalledWith("value", 2);
    });
  });

  describe("numeric param with zero raw range", () => {
    it("uses the flat tolerance and sets the display value directly", () => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("fixed-param") },
      });
      const param = registerMockObject("fixed-param", {
        properties: {
          name: "Fixed",
          original_name: "Fixed",
          is_quantized: 0,
          value: 5,
          min: 5,
          max: 5, // min === max → raw range 0 → tolerance falls back to 0.01
        },
        methods: {
          str_for_value: (v: unknown) => `${Number(v)} Hz`,
        },
      });

      updateDevice({ id: "dev1", params: [{ name: "Fixed", value: "5" }] });

      expect(param.set).toHaveBeenCalledWith("value", 5);
    });
  });

  describe("param not found warning", () => {
    it("should warn when param name does not match any device parameter", () => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children() },
      });

      updateDevice({
        id: "dev1",
        params: [{ name: "NonExistentParam", value: "0.5" }],
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining('"NonExistentParam" not found'),
      );
    });
  });
});

describe("updateDevice - sample pseudo-param", () => {
  it("loads a sample on a Simpler device via params", () => {
    const simpler = registerSimplerDevice();

    const result = updateDevice({
      id: "simpler-1",
      params: [{ name: "sample", value: "/tmp/kick.wav" }],
    });

    expect(simpler.call).toHaveBeenCalledWith(
      "replace_sample",
      "/tmp/kick.wav",
    );
    expect(result).toStrictEqual({ id: "simpler-1" });
  });

  it("does not look up sample as a DeviceParameter (no 'not found' warning)", () => {
    registerSimplerDevice();

    updateDevice({
      id: "simpler-1",
      params: [{ name: "sample", value: "/tmp/kick.wav" }],
    });

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining('"sample" not found'),
    );
  });

  it("loads sample alongside regular DeviceParameters in one params block", () => {
    const simpler = registerSimplerDevice("vol-param");
    const param = registerMockObject("vol-param", {
      properties: {
        name: "Volume",
        original_name: "Volume",
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (v: unknown) => `${Number(v)} dB` },
    });

    updateDevice({
      id: "simpler-1",
      params: [
        { name: "sample", value: "/tmp/kick.wav" },
        { name: "Volume", value: "0.8" },
      ],
    });

    expect(simpler.call).toHaveBeenCalledWith(
      "replace_sample",
      "/tmp/kick.wav",
    );
    expect(param.set).toHaveBeenCalledWith("value", 0.8);
  });
});

describe("updateDevice - actions arg", () => {
  it("dispatches a device action to its specialized handler", () => {
    const simpler = registerSimplerDevice();

    const result = updateDevice({ id: "simpler-1", actions: ["reverse"] });

    expect(simpler.call).toHaveBeenCalledWith("reverse");
    expect(result).toStrictEqual({ id: "simpler-1" });
  });

  it("applies actions alongside params in one call", () => {
    const simpler = registerSimplerDevice();

    updateDevice({
      id: "simpler-1",
      params: [{ name: "sample", value: "/tmp/kick.wav" }],
      actions: ["reverse"],
    });

    expect(simpler.call).toHaveBeenCalledWith(
      "replace_sample",
      "/tmp/kick.wav",
    );
    expect(simpler.call).toHaveBeenCalledWith("reverse");
  });

  it("warns when actions are set on a non-device target (chain)", () => {
    registerMockObject("chain-1", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
      properties: { name: "Chain", mute: 0, solo: 0, devices: [] },
    });

    updateDevice({ id: "chain-1", actions: ["reverse"] });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("'actions' not applicable to Chain"),
    );
  });
});
