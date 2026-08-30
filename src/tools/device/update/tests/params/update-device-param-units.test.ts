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
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// The unit on a written value used to be parsed off and dropped, leaving only
// the number: any unit wrote, and a value in seconds reached a bare-number
// param multiplied by 1000. These pin the unit to the param's own display.
describe("updateDevice - param units", () => {
  /**
   * Register a device holding one numeric param with the given display labels.
   * @param labelFor - Renders a raw value the way Live would display it
   * @returns The registered param
   */
  function registerParam(
    labelFor: (raw: number) => string,
  ): RegisteredMockObject {
    registerMockObject("dev1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { parameters: children("p1") },
    });

    return registerMockObject("p1", {
      properties: {
        name: "Amount",
        original_name: "Amount",
        is_quantized: 0,
        value: 50,
        min: 0,
        max: 100,
      },
      methods: { str_for_value: (v: unknown) => labelFor(Number(v)) },
    });
  }

  /** A param Live displays as a percentage, e.g. "50 %". */
  const asPercent = (raw: number): string => `${raw} %`;

  describe("a param that displays a unit", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      param = registerParam(asPercent);
    });

    it("writes a value carrying the param's own unit", () => {
      updateDevice({ id: "dev1", params: [{ name: "Amount", value: "20 %" }] });

      expect(expectValueSet(param)).toBe(20);
    });

    it("writes a value with no unit at all", () => {
      updateDevice({ id: "dev1", params: [{ name: "Amount", value: "20" }] });

      expect(expectValueSet(param)).toBe(20);
    });

    it("refuses a value in some other unit, naming the one it wants", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "Amount", value: "20 dB" }],
      });

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining('is measured in %, so "20 dB" was not written'),
      );
    });
  });

  describe("a param that displays a bare number", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      param = registerParam((raw) => String(raw));
    });

    it("writes a plain number", () => {
      updateDevice({ id: "dev1", params: [{ name: "Amount", value: "20" }] });

      expect(expectValueSet(param)).toBe(20);
    });

    // The bug this file exists for: parseLabel folds s into ms, so "0.5 s"
    // arrived as 500 on a param whose range is 0-100 — clamped to the top and
    // warned about as if 0.5 had been out of range.
    it("refuses a value carrying a unit, since it can't check one", () => {
      updateDevice({
        id: "dev1",
        params: [{ name: "Amount", value: "0.5 s" }],
      });

      expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("displays a plain number from 0 to 100"),
      );
    });
  });

  describe("units of the same quantity", () => {
    it("accepts seconds on a param displaying milliseconds", () => {
      const param = registerParam((raw) => `${raw} ms`);

      updateDevice({
        id: "dev1",
        params: [{ name: "Amount", value: "0.02 s" }],
      });

      expect(expectValueSet(param)).toBe(20);
    });

    it("accepts kHz on a param displaying Hz", () => {
      const param = registerParam((raw) => `${raw} Hz`);

      updateDevice({
        id: "dev1",
        params: [{ name: "Amount", value: "0.02 kHz" }],
      });

      expect(expectValueSet(param)).toBe(20);
    });
  });
});
