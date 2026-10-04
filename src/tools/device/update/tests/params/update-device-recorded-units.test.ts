// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readParameter } from "#src/tools/shared/device/helpers/param-reading.ts";
import { knownParamUnit } from "#src/tools/shared/device/known-param-units.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import {
  type RegisteredMockObject,
  children,
  expectParamRefused,
  expectValueSet,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

/**
 * Register a device at t0/d0 whose only param is the mock "p1".
 * @param deviceName - The device's class_display_name
 */
function registerDeviceWithP1(deviceName: string): void {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      class_display_name: deviceName,
      parameters: children("p1"),
    },
  });
}

// Some of Live's stock params display a bare number and nothing else, so what
// they measure is recorded in known-param-units.ts. Glue Compressor is the
// awkward pair: Attack displays milliseconds and Release displays seconds, both
// as bare numbers, so the number alone can't tell them apart.
describe("updateDevice - recorded param units", () => {
  /**
   * Register a device whose one param displays a bare number, as Live's do.
   * Raw and display values are the same here so a written display value lands
   * on the raw value the test can read back.
   * @param deviceName - The device's class_display_name
   * @param paramName - The param's name
   * @param min - Display minimum
   * @param max - Display maximum
   * @returns The registered param
   */
  function registerBareParam(
    deviceName: string,
    paramName: string,
    min: number,
    max: number,
  ): RegisteredMockObject {
    registerDeviceWithP1(deviceName);

    return registerMockObject("p1", {
      properties: {
        name: paramName,
        original_name: paramName,
        is_quantized: 0,
        value: min,
        min,
        max,
      },
      methods: { str_for_value: (v: unknown) => String(Number(v)) },
    });
  }

  /** Glue Compressor's Attack: 0.01-30, displayed as a bare number, in ms. */
  const registerAttack = (): RegisteredMockObject =>
    registerBareParam("Glue Compressor", "Attack", 0.01, 30);

  /** Glue Compressor's Release: 0.1-1.2, displayed as a bare number, in s. */
  const registerRelease = (): RegisteredMockObject =>
    registerBareParam("Glue Compressor", "Release", 0.1, 1.2);

  describe("a param recorded as milliseconds", () => {
    // This spelling worked before the unit check landed and was refused after
    // it, since Attack reports no unit of its own. Recording the unit is what
    // gives it back.
    it("accepts the recorded unit", () => {
      const param = registerAttack();

      updateDevice({
        id: "dev1",
        params: [{ name: "Attack", value: "10 ms" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(10);
    });

    it("converts seconds onto the param's scale", () => {
      const param = registerAttack();

      updateDevice({
        id: "dev1",
        params: [{ name: "Attack", value: "0.02 s" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(20);
    });

    it("still takes a bare number", () => {
      const param = registerAttack();

      updateDevice({ id: "dev1", params: [{ name: "Attack", value: "10" }] });

      expect(expectValueSet(param)).toBeCloseTo(10);
    });
  });

  describe("a param recorded as seconds", () => {
    // The number on screen is seconds, but parseLabel folds seconds into
    // milliseconds. Without putting the value back on the param's own scale,
    // "0.5 s" arrives as 500 against a range that stops at 1.2.
    it("writes the number the param displays, not the canonical one", () => {
      const param = registerRelease();

      updateDevice({
        id: "dev1",
        params: [{ name: "Release", value: "0.5 s" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(0.5);
    });

    it("accepts the same duration spelled in milliseconds", () => {
      const param = registerRelease();

      updateDevice({
        id: "dev1",
        params: [{ name: "Release", value: "500 ms" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(0.5);
    });

    it("refuses another quantity, naming the recorded unit", () => {
      const param = registerRelease();

      expectParamRefused(
        () =>
          updateDevice({
            id: "dev1",
            params: [{ name: "Release", value: "50 %" }],
          }),
        "Release",
        'is measured in s, so "50 %" was not written',
      );

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });
  });

  describe("a param recorded as octaves", () => {
    // Erosion's Filter Width: 0.1-2.5, displayed as a bare number, in octaves.
    // parseLabel has no pattern for "octaves" — read-device still reports it
    // (known-param-units.ts), and a write needs to round-trip the same spelling.
    const registerFilterWidth = (): RegisteredMockObject =>
      registerBareParam("Erosion", "Filter Width", 0.1, 2.5);

    it("accepts the recorded unit", () => {
      const param = registerFilterWidth();

      updateDevice({
        id: "dev1",
        params: [{ name: "Filter Width", value: "1.5 octaves" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(1.5);
    });

    it("accepts the recorded unit case-insensitively", () => {
      const param = registerFilterWidth();

      updateDevice({
        id: "dev1",
        params: [{ name: "Filter Width", value: "1.5 Octaves" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(1.5);
    });

    it("still takes a bare number", () => {
      const param = registerFilterWidth();

      updateDevice({
        id: "dev1",
        params: [{ name: "Filter Width", value: "1.5" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(1.5);
    });

    // resolveParamsByName matches a param name case-insensitively, so the
    // recorded-unit lookup has to as well — otherwise a lowercase name still
    // resolves to the right param but the unit round-trip breaks again.
    it("accepts the recorded unit with a lowercase param name", () => {
      const param = registerFilterWidth();

      updateDevice({
        id: "dev1",
        params: [{ name: "filter width", value: "1.5 octaves" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(1.5);
    });

    it("accepts the recorded unit with a mixed-case param name", () => {
      const param = registerFilterWidth();

      updateDevice({
        id: "dev1",
        params: [{ name: "Filter WIDTH", value: "1.5 octaves" }],
      });

      expect(expectValueSet(param)).toBeCloseTo(1.5);
    });

    it("refuses another quantity, naming the recorded unit", () => {
      const param = registerFilterWidth();

      expectParamRefused(
        () =>
          updateDevice({
            id: "dev1",
            params: [{ name: "Filter Width", value: "1.5 Hz" }],
          }),
        "Filter Width",
        'is measured in octaves, so "1.5 Hz" was not written',
      );

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });

    it("refuses an unrecognized spelling", () => {
      const param = registerFilterWidth();

      expectParamRefused(
        () =>
          updateDevice({
            id: "dev1",
            params: [{ name: "Filter Width", value: "1.5 wobbles" }],
          }),
        "Filter Width",
        'could not interpret "1.5 wobbles"',
      );

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });

    // The range no longer matching drops the recorded entry (the range guard
    // below), but normalizeParamValue's spelling match runs before a param is
    // resolved and so can't see that — it still turns "1.5 octaves" into a
    // number. displayValueForWrite is the one that catches the stale entry.
    it("refuses the recorded unit when the param's range no longer matches", () => {
      const param = registerBareParam("Erosion", "Filter Width", 0.1, 3);

      expectParamRefused(
        () =>
          updateDevice({
            id: "dev1",
            params: [{ name: "Filter Width", value: "1.5 octaves" }],
          }),
        "Filter Width",
        "never says what it measures",
      );

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });
  });

  // Live shows this as "57/43" — a ratio between two sections, not a quantity —
  // and its Info View names no unit. It was briefly recorded as a percentage
  // from a manual summary, which made read-device report a unit Live disowns.
  it("leaves a blend ratio unitless", () => {
    const param = registerBareParam("Hybrid Reverb", "Blend", 100, 0);

    expectParamRefused(
      () =>
        updateDevice({
          id: "dev1",
          params: [{ name: "Blend", value: "50 %" }],
        }),
      "Blend",
      "never says what it measures",
    );

    expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
  });

  describe("the range guard", () => {
    // The range is part of the key. A Live version that moves it has changed
    // what the control does, and reporting the old unit would be worse than
    // reporting none.
    it.each([
      [
        "drops the entry when the param's range no longer matches",
        "Glue Compressor",
        60,
      ],
      ["leaves a param on another device alone", "Compressor", 30],
    ])("%s", (_name, deviceName, max) => {
      const param = registerBareParam(deviceName, "Attack", 0.01, max);

      expectParamRefused(
        () =>
          updateDevice({
            id: "dev1",
            params: [{ name: "Attack", value: "10 ms" }],
          }),
        "Attack",
        "never says what it measures",
      );

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });
  });
});

// Analog's F1 Freq and F2 Freq read " 30", "173", "999", then "1.00k" ... "22.0k":
// no "Hz" anywhere, and a bare k for thousands. Raw 0-1 maps to 30-22000 Hz
// on a log scale.
const MIN_HZ = 30;
const MAX_HZ = 22000;

function hzFor(raw: number): number {
  return MIN_HZ * (MAX_HZ / MIN_HZ) ** raw;
}

function analogLabel(raw: unknown): string {
  const hz = hzFor(Number(raw));

  if (hz < 1000) {
    return String(Math.round(hz)).padStart(3);
  }

  return hz < 10000
    ? `${(hz / 1000).toFixed(2)}k`
    : `${(hz / 1000).toFixed(1)}k`;
}

const analogProps = {
  name: "F1 Freq",
  original_name: "F1 Freq",
  is_quantized: 0,
  min: 0,
  max: 1,
};

describe("Analog filter frequency", () => {
  describe("recorded units", () => {
    it("records both filters in Hz over 30-22000", () => {
      for (const name of ["F1 Freq", "F2 Freq"]) {
        expect(knownParamUnit("Analog", name, 30, 22000)?.unit).toBe("Hz");
      }
    });

    it("drops the entry when the range differs", () => {
      expect(knownParamUnit("Analog", "F1 Freq", 30, 22)).toBeNull();
    });
  });

  describe("reading", () => {
    it("reports a rising range in Hz", () => {
      const path = `${livePath.track(0).device(0)} parameters 0`;

      registerMockObject("param-1", {
        path,
        type: "DeviceParameter",
        properties: {
          ...analogProps,
          is_enabled: 1,
          state: 0,
          automation_state: 0,
          value: 1,
        },
        methods: { str_for_value: analogLabel },
      });

      const result = readParameter(LiveAPI.from(path), "Analog");

      // Before, "22.0k" read as 22, giving min 30 and max 22.
      expect(result.min).toBe(30);
      expect(result.max).toBe(22000);
      expect(result.value).toBe(22000);
      expect(result.unit).toBe("Hz");
    });
  });

  describe("writing", () => {
    function registerAnalog(deviceName = "Analog"): RegisteredMockObject {
      registerDeviceWithP1(deviceName);

      return registerMockObject("p1", {
        properties: { ...analogProps, value: 0 },
        methods: { str_for_value: analogLabel },
      });
    }

    function write(param: RegisteredMockObject, value: string): number {
      param.set.mockClear();
      updateDevice({ id: "dev1", params: [{ name: "F1 Freq", value }] });

      return hzFor(expectValueSet(param));
    }

    it.each(["800", "800 Hz", "0.8 kHz", "0.8k", "0.8 K"])(
      "lands '%s' on 800 Hz",
      (value) => {
        const param = registerAnalog();

        expect(write(param, value)).toBeCloseTo(800, -1);
      },
    );

    it("lands a value in the thousands", () => {
      const param = registerAnalog();

      expect(write(param, "5k")).toBeCloseTo(5000, -2);
      expect(write(param, "12 kHz")).toBeCloseTo(12000, -2);
    });

    it("refuses a unit that isn't a frequency", () => {
      const param = registerAnalog();

      expectParamRefused(
        () =>
          updateDevice({
            id: "dev1",
            params: [{ name: "F1 Freq", value: "800 dB" }],
          }),
        "F1 Freq",
        'is measured in Hz, so "800 dB" was not written',
      );

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });
  });
});
