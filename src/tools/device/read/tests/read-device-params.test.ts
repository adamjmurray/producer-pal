// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { setupDeviceParamMocks } from "./read-device-test-helpers.ts";
import { readDevice } from "../read-device.ts";

describe("readDevice param-values include option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("should include full parameters when param-values is requested", () => {
    setupDeviceParamMocks({ strForValue: dbStrForValue });

    const { result } = readDeviceParamValues();

    expect(result).toStrictEqual({
      id: "device-123",
      type: "instrument: Operator",
      parameters: [
        {
          id: "param-1",
          name: "Volume",
          value: -6,
          min: -70, // -inf dB converts to -70
          max: 0,
          unit: "dB",
        },
      ],
    });
  });

  it("should handle quantized parameters with options array", () => {
    setupDeviceParamMocks({
      param: {
        name: "Device On",
        original_name: "Device On",
        value: 1,
        is_quantized: 1,
        value_items: ["Off", "On"],
      },
    });

    const { params } = readDeviceParamValues();

    // Quantized params now have value as string and options array
    expect(params[0]).toStrictEqual({
      id: "param-1",
      name: "Device On",
      value: "On",
      options: ["Off", "On"],
    });
  });

  it("should include state when not 'active'", () => {
    setupDeviceParamMocks({
      param: { state: 1, display_value: 50 },
      strForValue: () => "50",
    });

    const { params } = readDeviceParamValues();

    expect(params[0]!.state).toBe("inactive");
  });

  it("should always include min and max for numeric parameters", () => {
    setupDeviceParamMocks({
      param: {
        name: "Coarse",
        original_name: "Coarse",
        value: 12,
        min: 0,
        max: 48,
        default_value: 1,
        display_value: 12,
      },
      strForValue: (value) => String(value),
    });

    const { params } = readDeviceParamValues();

    // min and max should always be included for numeric params
    expect(params[0]).toHaveProperty("min", 0);
    expect(params[0]).toHaveProperty("max", 48);
    expect(params[0]!.value).toBe(12);
  });

  it("should report the display range when Max returns bare-number labels", () => {
    // Max hands back a JS number, not a string, when a label has no unit or
    // suffix (EQ Eight `Q`, Glue Compressor `Attack`). Uncoerced, the label
    // fails parseLabel's type guard and the param falls back to raw units —
    // here that would report min 0, max 1, value 999.
    setupDeviceParamMocks({
      param: {
        name: "1 Q A",
        original_name: "1 Q A",
        value: 0.5,
        min: 0,
        max: 1,
        display_value: 999,
      },
      strForValue: (value) => 1 + Number(value) * 17,
    });

    const { params } = readDeviceParamValues();

    expect(params[0]).toStrictEqual({
      id: "param-1",
      name: "1 Q A",
      value: 9.5,
      min: 1,
      max: 18,
    });
  });

  it("should not include min and max for quantized parameters", () => {
    setupDeviceParamMocks({
      param: {
        name: "Algorithm",
        original_name: "Algorithm",
        value: 0,
        min: 0,
        max: 10,
        is_quantized: 1,
        value_items: ["Alg 1", "Alg 2", "Alg 3"],
      },
    });

    const { params } = readDeviceParamValues();

    // Quantized params should have options, not min/max
    expect(params[0]).not.toHaveProperty("min");
    expect(params[0]).not.toHaveProperty("max");
    expect(params[0]).toHaveProperty("options");
    expect(params[0]!.value).toBe("Alg 1");
  });

  it("should parse frequency labels and include unit", () => {
    setupDeviceParamMocks({
      device: {
        name: "Filter",
        class_display_name: "Auto Filter",
        type: 2,
      },
      param: {
        name: "Frequency",
        original_name: "Frequency",
        display_value: 1000,
      },
      strForValue: (value) => {
        if (value === 0) return "20 Hz";
        if (value === 1) return "20.0 kHz";

        return "1.00 kHz";
      },
    });

    const { params } = readDeviceParamValues();

    expect(params[0]).toStrictEqual({
      id: "param-1",
      name: "Frequency",
      value: 1000,
      min: 20,
      max: 20000,
      unit: "Hz",
    });
  });

  it("should include automation when not 'none'", () => {
    setupAutomationMocks(1);

    const { params } = readDeviceParamValues();

    expect(params[0]!.automation).toBe("active");
  });

  it("should omit automation when 'none'", () => {
    setupAutomationMocks(0);

    const { params } = readDeviceParamValues();

    expect(params[0]).not.toHaveProperty("automation");
  });
});

describe("readDevice params include option (lightweight)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("should return only id and name for params include", () => {
    setupDeviceParamMocks();

    const result = readDevice({
      id: "device-123",
      include: ["params"],
    });

    expect(result.parameters).toStrictEqual([
      {
        id: "param-1",
        name: "Volume",
      },
    ]);
  });
});

/**
 * Reads the mocked device with the "param-values" include.
 * @returns The whole read result plus its parameter list, cast for property assertions
 */
function readDeviceParamValues(): {
  result: ReturnType<typeof readDevice>;
  params: Record<string, unknown>[];
} {
  const result = readDevice({
    id: "device-123",
    include: ["param-values"],
  });

  return {
    result,
    params: result.parameters as Record<string, unknown>[],
  };
}

// Live states no unit for about a fifth of its stock numeric params. What those
// measure is recorded in known-param-units.ts and reported here, so a model has
// something to write back.
describe("readDevice recorded units", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  /**
   * Read one bare-number param off a named device.
   * @param className - The device's class_display_name
   * @param name - The param's name
   * @param range - The param's display range
   * @returns The parameter as read-device reports it
   */
  function readBareParam(
    className: string,
    name: string,
    range: { min: number; max: number },
  ): Record<string, unknown> {
    setupDeviceParamMocks({
      device: { class_display_name: className },
      param: { name, original_name: name, value: range.min, ...range },
      strForValue: (value) => String(Number(value)),
    });

    const result = readDevice({ id: "device-123", include: ["param-values"] });
    const [param] = (result as { parameters: Record<string, unknown>[] })
      .parameters;

    return param as Record<string, unknown>;
  }

  it("reports the recorded unit for a param that displays none", () => {
    expect(
      readBareParam("Glue Compressor", "Attack", { min: 0.01, max: 30 }),
    ).toStrictEqual({
      id: "param-1",
      name: "Attack",
      value: 0.01,
      min: 0.01,
      max: 30,
      unit: "ms",
    });
  });

  it("reports nothing for the same param name on another device", () => {
    expect(
      readBareParam("Compressor", "Attack", { min: 0.01, max: 30 }),
    ).not.toHaveProperty("unit");
  });

  it("reports nothing when the range no longer matches what was recorded", () => {
    expect(
      readBareParam("Glue Compressor", "Attack", { min: 0.01, max: 60 }),
    ).not.toHaveProperty("unit");
  });
});

/**
 * Stubs Live's str_for_value for a dB-scaled parameter.
 * @param value - The normalized parameter value Live is asking about
 * @returns The dB label Live would display for that value
 */
function dbStrForValue(value: unknown): string {
  if (value === 0) return "-inf dB";
  if (value === 1) return "0 dB";

  return "-6 dB";
}

/**
 * Setup mocks for automation tests
 * @param automationState - Automation state value
 */
function setupAutomationMocks(automationState: number): void {
  setupDeviceParamMocks({
    param: { automation_state: automationState },
    strForValue: dbStrForValue,
  });
}
