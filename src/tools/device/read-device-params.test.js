import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiGet, liveApiId } from "#src/test/mock-live-api.js";
import { readDevice } from "./read-device.js";

describe("readDevice param-values include option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include full parameters when param-values is requested", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Volume"];
          case "original_name":
            return ["Volume"];
          case "value":
            return [0.5];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0];
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          case "display_value":
            return [-6];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (this._path === "id param-1" && method === "str_for_value") {
        // min=0, max=1 return same label format
        if (value === 0) return "-inf dB";
        if (value === 1) return "0 dB";
        return "-6 dB";
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result).toEqual({
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
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Device On"];
          case "original_name":
            return ["Device On"];
          case "value":
            return [1];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0];
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [1];
          case "value_items":
            return ["Off", "On"];
          default:
            return [];
        }
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    // Quantized params now have value as string and options array
    expect(result.parameters[0]).toEqual({
      id: "param-1",
      name: "Device On",
      value: "On",
      options: ["Off", "On"],
    });
  });

  it("should include state when not 'active'", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Volume"];
          case "original_name":
            return ["Volume"];
          case "value":
            return [0.5];
          case "state":
            return [1]; // inactive
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0];
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          case "display_value":
            return [50];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "str_for_value") return "50";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0].state).toBe("inactive");
  });

  it("should always include min and max for numeric parameters", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Coarse"];
          case "original_name":
            return ["Coarse"];
          case "value":
            return [12];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0];
          case "min":
            return [0];
          case "max":
            return [48];
          case "is_quantized":
            return [0];
          case "default_value":
            return [1];
          case "display_value":
            return [12];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (method === "str_for_value") {
        // Unitless numeric labels
        return String(value);
      }
      return [];
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
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Algorithm"];
          case "original_name":
            return ["Algorithm"];
          case "value":
            return [0];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0];
          case "min":
            return [0];
          case "max":
            return [10];
          case "is_quantized":
            return [1];
          case "value_items":
            return ["Alg 1", "Alg 2", "Alg 3"];
          default:
            return [];
        }
      }
      return [];
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
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Filter"];
          case "class_display_name":
            return ["Auto Filter"];
          case "type":
            return [2];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Frequency"];
          case "original_name":
            return ["Frequency"];
          case "value":
            return [0.5];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0];
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.5];
          case "display_value":
            return [1000];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (method === "str_for_value") {
        if (value === 0) return "20 Hz";
        if (value === 1) return "20.0 kHz";
        return "1.00 kHz";
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0]).toEqual({
      id: "param-1",
      name: "Frequency",
      value: 1000,
      min: 20,
      max: 20000,
      unit: "Hz",
    });
  });

  it("should include automation when not 'none'", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Volume"];
          case "original_name":
            return ["Volume"];
          case "value":
            return [0.5];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [1]; // active automation
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          case "display_value":
            return [-6];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (this._path === "id param-1" && method === "str_for_value") {
        if (value === 0) return "-inf dB";
        if (value === 1) return "0 dB";
        return "-6 dB";
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
    });

    expect(result.parameters[0].automation).toBe("active");
  });

  it("should omit automation when 'none'", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Volume"];
          case "original_name":
            return ["Volume"];
          case "value":
            return [0.5];
          case "state":
            return [0];
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0]; // no automation
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          case "display_value":
            return [-6];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (this._path === "id param-1" && method === "str_for_value") {
        if (value === 0) return "-inf dB";
        if (value === 1) return "0 dB";
        return "-6 dB";
      }
      return [];
    });

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
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1];
          case "can_have_chains":
            return [0];
          case "can_have_drum_pads":
            return [0];
          case "is_active":
            return [1];
          case "parameters":
            return ["id", "param-1"];
          default:
            return [];
        }
      }
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Volume"];
          case "original_name":
            return ["Volume"];
          default:
            return [];
        }
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    expect(result.parameters).toEqual([
      {
        id: "param-1",
        name: "Volume",
      },
    ]);
  });
});
