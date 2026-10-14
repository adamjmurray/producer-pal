// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../../update-device.ts";
import { noParamLanded } from "../update-device-test-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - division params", () => {
  let param: RegisteredMockObject;

  const divisionMap: Record<string, string> = {
    "-6": "1/64",
    "-5": "1/32",
    "-4": "1/16",
    "-3": "1/8",
    "-2": "1/4",
    "-1": "1/2",
    "0": "1",
  };

  beforeEach(() => {
    registerMockObject("123", {
      path: livePath.track(0).device(0),
      type: "Device",
    });

    // Division param setup: raw values -6 to 0 map to "1/64" to "1"
    param = registerMockObject("793", {
      path: livePath.track(0).device(0).parameter(1),
      type: "DeviceParameter",
      properties: {
        name: "Rate",
        original_name: "Rate",
        is_quantized: 0,
        value: -3,
        min: -6,
        max: 0,
      },
      methods: {
        str_for_value: (value: unknown) =>
          divisionMap[String(value)] ?? String(value),
      },
    });
  });

  it("should set raw value for division param by matching label", () => {
    const result = updateDevice({
      id: "123",
      params: [{ name: "793", value: "1/16" }],
    });

    // "1/16" maps to raw value -4
    expect(param.set).toHaveBeenCalledWith("value", -4);
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/d0",
      params: [{ id: "793", name: "Rate", value: "1/16" }],
    });
  });

  it("should handle setting division to max value (1)", () => {
    const result = updateDevice({
      id: "123",
      params: [{ name: "793", value: "1" }],
    });

    // "1" maps to raw value 0
    expect(param.set).toHaveBeenCalledWith("value", 0);
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/d0",
      params: [{ id: "793", name: "Rate", value: "1" }],
    });
  });

  it("reports an invalid division value in the error", () => {
    expect(
      noParamLanded(() =>
        updateDevice({
          id: "123",
          params: [{ name: "793", value: "1/128" }],
        }),
      ),
    ).toBe('no param landed — "793": "1/128" is not a valid division option');
    expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    expect(capturedWarnings()).toHaveLength(0);
  });

  describe("a sync ladder with dotted and triplet rates", () => {
    // Analog's LFO sync rate: bar counts, then fractions, each with a d and t.
    const ladder = ["4d", "4", "4t", "1/4d", "1/4", "1/4t", "1/32d", "1/32t"];
    let rate: RegisteredMockObject;

    function registerLadder(current: number): void {
      rate = registerMockObject("794", {
        path: livePath.track(0).device(0).parameter(2),
        type: "DeviceParameter",
        properties: {
          name: "LFO1 SncRate",
          original_name: "LFO1 SncRate",
          is_quantized: 0,
          value: current,
          min: 0,
          max: ladder.length - 1,
        },
        methods: {
          str_for_value: (value: unknown) => ladder[Number(value)] ?? "?",
        },
      });
    }

    it.each([
      ["4 d", 0],
      ["4D", 0],
      ["4 t", 2],
      ["1/4D", 3],
      ["1/4 d", 3],
      ["1 / 4 T", 5],
      ["1/32T", 7],
      ["1 / 4", 4],
    ])("writes %s to option index %i", (value, index) => {
      registerLadder(4);

      updateDevice({ id: "123", params: [{ name: "794", value }] });

      expect(rate.set).toHaveBeenCalledWith("value", index);
    });

    it("reports the dotted rate it landed on, not its leading number", () => {
      registerLadder(1);

      const result = updateDevice({
        id: "123",
        params: [{ name: "794", value: "4 d" }],
      });

      expect(rate.set).toHaveBeenCalledWith("value", 0);
      expect(result).toStrictEqual({
        id: "123",
        path: "t0/d0",
        params: [{ id: "794", name: "LFO1 SncRate", value: "4d" }],
      });
    });

    it("writes the bare bar count, not the dotted rate", () => {
      registerLadder(0);

      updateDevice({ id: "123", params: [{ name: "794", value: "4" }] });

      expect(rate.set).toHaveBeenCalledWith("value", 1);
    });

    it("refuses a rate the ladder doesn't have", () => {
      registerLadder(0);

      expect(
        noParamLanded(() =>
          updateDevice({
            id: "123",
            params: [{ name: "794", value: "1/8 d" }],
          }),
        ),
      ).toBe('no param landed — "794": "1/8 d" is not a valid division option');
      expect(rate.set).not.toHaveBeenCalled();
    });
  });
});
