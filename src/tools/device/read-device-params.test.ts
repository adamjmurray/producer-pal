import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall } from "#src/test/mocks/mock-live-api.js";
import { setupDeviceParamMocks } from "./read-device-test-helpers.js";
import { readDevice } from "./read-device.js";

describe("readDevice param-values include option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include full parameters when param-values is requested", () => {
    setupDeviceParamMocks({
      strForValue: (value) => {
        if (value === 0) return "-inf dB";
        if (value === 1) return "0 dB";

        return "-6 dB";
      },
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

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

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    // Quantized params now have value as string and options array
    expect(result.parameters[0]).toStrictEqual({
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

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0].state).toBe("inactive");
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

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    // min and max should always be included for numeric params
    expect(result.parameters[0]).toHaveProperty("min", 0);
    expect(result.parameters[0]).toHaveProperty("max", 48);
    expect(result.parameters[0].value).toBe(12);
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

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    // Quantized params should have options, not min/max
    expect(result.parameters[0]).not.toHaveProperty("min");
    expect(result.parameters[0]).not.toHaveProperty("max");
    expect(result.parameters[0]).toHaveProperty("options");
    expect(result.parameters[0].value).toBe("Alg 1");
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

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0]).toStrictEqual({
      id: "param-1",
      name: "Frequency",
      value: 1000,
      min: 20,
      max: 20000,
      unit: "Hz",
    });
  });

  /**
   * Setup mocks for automation tests
   * @param {number} automationState - The automation state value
   */
  function setupAutomationMocks(automationState) {
    setupDeviceParamMocks({
      param: { automation_state: automationState },
      strForValue: (value) => {
        if (value === 0) return "-inf dB";
        if (value === 1) return "0 dB";

        return "-6 dB";
      },
    });
  }

  it("should include automation when not 'none'", () => {
    setupAutomationMocks(1);
    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0].automation).toBe("active");
  });

  it("should omit automation when 'none'", () => {
    setupAutomationMocks(0);
    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0]).not.toHaveProperty("automation");
  });
});

describe("readDevice params include option (lightweight)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return only id and name for params include", () => {
    setupDeviceParamMocks();

    // Need to set up liveApiCall to not interfere since we're not requesting param-values
    liveApiCall.mockReturnValue([]);

    const result = readDevice({
      deviceId: "device-123",
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
