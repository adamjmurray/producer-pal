import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
} from "#src/test/mocks/mock-live-api.js";
import { readDevice } from "./read-device.js";

// Setup basic device mocks with two parameters
function setupDeviceMocks() {
  liveApiId.mockImplementation(function () {
    if (this._path === "id device-123") return "device-123";
    if (this._path === "id param-1") return "param-1";
    if (this._path === "id param-2") return "param-2";

    return "0";
  });
}

// Get device properties for mock
function getDeviceProps(prop) {
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
      return ["id", "param-1", "id", "param-2"];
    default:
      return [];
  }
}

// Get basic param props (for lightweight params)
function getBasicParamProps(path, prop) {
  if (path === "id param-1") {
    if (prop === "name") return ["Volume"];
    if (prop === "original_name") return ["Volume"];
  }

  if (path === "id param-2") {
    if (prop === "name") return ["Filter Cutoff"];
    if (prop === "original_name") return ["Filter Cutoff"];
  }

  return [];
}

// Get full param props (for param-values)
function getFullParamProps(path, prop) {
  const basic = getBasicParamProps(path, prop);

  if (basic.length > 0) return basic;

  if (path === "id param-1") {
    switch (prop) {
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
    }
  }

  if (path === "id param-2") {
    switch (prop) {
      case "value":
        return [1000];
      case "state":
        return [0];
      case "is_enabled":
        return [1];
      case "automation_state":
        return [0];
      case "min":
        return [20];
      case "max":
        return [20000];
      case "is_quantized":
        return [0];
      case "default_value":
        return [10000];
    }
  }

  return [];
}

describe("readDevice paramSearch filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupBasicMocks() {
    setupDeviceMocks();
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        return getDeviceProps(prop);
      }

      return getBasicParamProps(this._path, prop);
    });
  }

  it("should filter parameters by case-insensitive substring match", () => {
    setupBasicMocks();

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
      paramSearch: "vol",
    });

    expect(result.parameters).toHaveLength(1);
    expect(result.parameters[0].name).toBe("Volume");
  });

  it("should be case-insensitive when filtering", () => {
    setupBasicMocks();

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
      paramSearch: "FILTER",
    });

    expect(result.parameters).toHaveLength(1);
    expect(result.parameters[0].name).toBe("Filter Cutoff");
  });

  it("should return empty array when no parameters match", () => {
    setupBasicMocks();

    const result = readDevice({
      deviceId: "device-123",
      include: ["params"],
      paramSearch: "nonexistent",
    });

    expect(result.parameters).toHaveLength(0);
  });

  it("should work with param-values include", () => {
    setupDeviceMocks();

    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123") {
        return getDeviceProps(prop);
      }

      const fullProps = getFullParamProps(this._path, prop);

      if (fullProps.length > 0) return fullProps;

      if (prop === "display_value") {
        if (this._path === "id param-1") return [-6];
        if (this._path === "id param-2") return [1000];
      }

      return [];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (method === "str_for_value") {
        if (this._path === "id param-1") {
          if (value === 0) return "-inf dB";
          if (value === 1) return "0 dB";

          return "-6 dB";
        }

        if (this._path === "id param-2") {
          if (value === 20) return "20 Hz";
          if (value === 20000) return "20.0 kHz";

          return "1.00 kHz";
        }
      }

      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["param-values"],
      paramSearch: "vol",
    });

    expect(result.parameters).toHaveLength(1);
    // New format: parsed value with unit, min/max from label parsing
    expect(result.parameters[0]).toStrictEqual({
      id: "param-1",
      name: "Volume",
      value: -6,
      min: -70, // -inf dB → -70
      max: 0,
      unit: "dB",
    });
  });
});
