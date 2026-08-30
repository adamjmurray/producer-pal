// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  expectValueSet,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// Live states no unit for about a fifth of its stock numeric params, so what
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
    registerMockObject("dev1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        class_display_name: deviceName,
        parameters: children("p1"),
      },
    });

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

      updateDevice({
        id: "dev1",
        params: [{ name: "Release", value: "50 %" }],
      });

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining('is measured in s, so "50 %" was not written'),
      );
    });
  });

  // Live shows this as "57/43" — a ratio between two sections, not a quantity —
  // and its Info View names no unit. It was briefly recorded as a percentage
  // from a manual summary, which made read-device report a unit Live disowns.
  it("leaves a blend ratio unitless", () => {
    const param = registerBareParam("Hybrid Reverb", "Blend", 100, 0);

    updateDevice({ id: "dev1", params: [{ name: "Blend", value: "50 %" }] });

    expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("never says what it measures"),
    );
  });

  describe("the range guard", () => {
    // The range is part of the key. A Live version that moves it has changed
    // what the control does, and reporting the old unit would be worse than
    // reporting none.
    it("drops the entry when the param's range no longer matches", () => {
      const param = registerBareParam("Glue Compressor", "Attack", 0.01, 60);

      updateDevice({
        id: "dev1",
        params: [{ name: "Attack", value: "10 ms" }],
      });

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("never says what it measures"),
      );
    });

    it("leaves a param on another device alone", () => {
      const param = registerBareParam("Compressor", "Attack", 0.01, 30);

      updateDevice({
        id: "dev1",
        params: [{ name: "Attack", value: "10 ms" }],
      });

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    });
  });
});
