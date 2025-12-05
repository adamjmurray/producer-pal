import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
} from "../../test/mock-live-api.js";
import { readDevice } from "./read-device.js";

describe("readDevice params include option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include parameters when params is requested", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      // Device properties
      if (this._path === "id device-123") {
        switch (prop) {
          case "name":
            return ["Operator"];
          case "class_display_name":
            return ["Operator"];
          case "type":
            return [1]; // instrument
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
      // Parameter properties (non-quantized)
      if (this._path === "id param-1") {
        switch (prop) {
          case "name":
            return ["Volume"];
          case "original_name":
            return ["Volume"];
          case "value":
            return [0.5];
          case "state":
            return [0]; // active
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0]; // none
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      if (this._path === "id param-1" && method === "str_for_value") {
        return "-6 dB";
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    expect(result).toEqual({
      id: "device-123",
      type: "instrument: Operator",
      parameters: [
        {
          id: "param-1",
          name: "Volume",
          value: 0.5,
          displayValue: "-6 dB",
          // state and automation omitted when "active"/"none"
          min: 0,
          max: 1,
          defaultValue: 0.7,
        },
      ],
    });
  });

  it("should handle quantized parameters with allowedValues", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id param-1") return "param-1";
      return "0";
    });

    liveApiGet.mockImplementation(function (prop) {
      // Device properties
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
      // Parameter properties (quantized)
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

    liveApiCall.mockImplementation(function (method) {
      if (this._path === "id param-1" && method === "str_for_value") {
        return "On";
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    expect(result.parameters[0]).toEqual({
      id: "param-1",
      name: "Device On",
      value: 1,
      displayValue: "On",
      // state/automation omitted when default, min/max omitted for quantized
      allowedValues: ["Off", "On"],
    });
  });

  it("should include originalName when different from name", () => {
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
            return ["My Custom Param"];
          case "original_name":
            return ["Macro 1"];
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
            return [127];
          case "is_quantized":
            return [0];
          case "default_value":
            return [64];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "str_for_value") return "64";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    expect(result.parameters[0].name).toBe("My Custom Param");
    expect(result.parameters[0].originalName).toBe("Macro 1");
  });

  it("should include enabled:false when parameter is disabled", () => {
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
            return [0]; // disabled
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
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "str_for_value") return "-6 dB";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    expect(result.parameters[0].enabled).toBe(false);
  });

  it("should map state and automation values correctly", () => {
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
            return [2]; // disabled
          case "is_enabled":
            return [1];
          case "automation_state":
            return [1]; // active
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "str_for_value") return "-6 dB";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    expect(result.parameters[0].state).toBe("disabled");
    expect(result.parameters[0].automation).toBe("active");
  });

  it("should omit displayValue when identical to value", () => {
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
            return [12]; // Integer value
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
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      // str_for_value returns "12" which matches value 12
      if (method === "str_for_value") return "12";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    // displayValue should be omitted since "12" === String(12)
    expect(result.parameters[0]).not.toHaveProperty("displayValue");
    expect(result.parameters[0].value).toBe(12);
  });

  it("should omit state and automation when they have default values", () => {
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
            return [0]; // active (default)
          case "is_enabled":
            return [1];
          case "automation_state":
            return [0]; // none (default)
          case "min":
            return [0];
          case "max":
            return [1];
          case "is_quantized":
            return [0];
          case "default_value":
            return [0.7];
          default:
            return [];
        }
      }
      return [];
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "str_for_value") return "-6 dB";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    // state and automation should be omitted when they have default values
    expect(result.parameters[0]).not.toHaveProperty("state");
    expect(result.parameters[0]).not.toHaveProperty("automation");
  });

  it("should omit min and max for quantized parameters", () => {
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

    liveApiCall.mockImplementation(function (method) {
      if (method === "str_for_value") return "Alg 1";
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
    });

    // min and max should be omitted for quantized parameters
    expect(result.parameters[0]).not.toHaveProperty("min");
    expect(result.parameters[0]).not.toHaveProperty("max");
    expect(result.parameters[0]).toHaveProperty("allowedValues");
  });
});
