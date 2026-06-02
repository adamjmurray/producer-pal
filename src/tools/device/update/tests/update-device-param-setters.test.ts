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
} from "./update-device-test-helpers.ts";

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
        ids: "dev1",
        params: [{ name: "AEG1 Rel", value: "600" }],
      });

      const displayValue = 5 * Math.pow(15000 / 5, expectValueSet(param));

      expect(displayValue).toBeCloseTo(600, 0);
    });

    it("should handle target at min boundary", () => {
      updateDevice({ ids: "dev1", params: [{ name: "AEG1 Rel", value: "5" }] });

      expect(expectValueSet(param)).toBeCloseTo(0, 1);
    });

    it("should handle target at max boundary", () => {
      updateDevice({
        ids: "dev1",
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
      updateDevice({ ids: "dev1", params: [{ name: "Decay", value: "5000" }] });

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
        ids: "dev1",
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
        ids: "dev1",
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
        ids: "dev1",
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
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("flaky-param") },
      });
      param = registerMockObject("flaky-param", {
        properties: {
          name: "Flaky",
          original_name: "Flaky",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Min/max labels parseable (triggers binary search),
          // but mid-range label becomes unparseable
          str_for_value: (v: unknown) => {
            const n = Number(v);

            if (n <= 0.01) return "0 Hz";
            if (n >= 0.99) return "1000 Hz";

            return "---";
          },
        },
      });
    });

    it("should converge toward min when mid-range labels parse as NaN", () => {
      updateDevice({ ids: "dev1", params: [{ name: "Flaky", value: "500" }] });

      // "---" parses as NaN (leading hyphens match the number regex).
      // NaN comparisons always false, so binary search treats it as
      // greater-than-target and converges hi toward lo (near rawMin).
      expect(expectValueSet(param)).toBeCloseTo(0.01, 1);
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
      updateDevice({ ids: "dev1", params: [{ name: "42", value: "0.8" }] });

      expect(param.set).toHaveBeenCalledWith("value", 0.8);
    });
  });

  describe("resolve param by relative device path", () => {
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

    it("should resolve param via device-relative 'parameters N' path", () => {
      // Use numeric key "3" which triggers resolveParamForDevice
      // with "3" as paramId. Since "3" doesn't match /parameters (\d+)$/,
      // it falls through to LiveAPI.from("3") — the absolute ID path.
      // To test the relative "parameters N" path, use name-based resolution.
      updateDevice({ ids: "dev1", params: [{ name: "Freq", value: "0.6" }] });

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
      updateDevice({ ids: "dev1", params: [{ name: "Pitch", value: "C-3" }] });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining('invalid note name "C-3"'),
      );
    });
  });

  describe("binary search with string-valued label mid-iteration", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("note-display-param") },
      });
      param = registerMockObject("note-display-param", {
        properties: {
          name: "NoteParam",
          original_name: "NoteParam",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Min/max labels are numeric (triggers binary search),
          // but mid-range returns a note name (string value from parseLabel)
          str_for_value: (v: unknown) => {
            const n = Number(v);

            if (n <= 0.01) return "0 Hz";
            if (n >= 0.99) return "1000 Hz";

            return "C4";
          },
        },
      });
    });

    it("should return mid when binary search encounters string-typed label", () => {
      updateDevice({
        ids: "dev1",
        params: [{ name: "NoteParam", value: "500" }],
      });

      // "C4" parses as { value: "C4", unit: "note" } — a string value.
      // binarySearchRawValue returns mid immediately on string-typed labels.
      expect(expectValueSet(param)).toBe(0.5);
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
        ids: "dev1",
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
      ids: "simpler-1",
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
      ids: "simpler-1",
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
      ids: "simpler-1",
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

    const result = updateDevice({ ids: "simpler-1", actions: ["reverse"] });

    expect(simpler.call).toHaveBeenCalledWith("reverse");
    expect(result).toStrictEqual({ id: "simpler-1" });
  });

  it("applies actions alongside params in one call", () => {
    const simpler = registerSimplerDevice();

    updateDevice({
      ids: "simpler-1",
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

    updateDevice({ ids: "chain-1", actions: ["reverse"] });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("'actions' not applicable to Chain"),
    );
  });
});

describe("updateDevice - path-prefixed pseudo-params", () => {
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

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('empty name after "/"'),
    );
  });
});
