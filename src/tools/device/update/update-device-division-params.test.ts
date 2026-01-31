import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { updateDevice } from "./update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - division params", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    liveApiType.mockImplementation(() => "Device");

    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "id 123") return "123";
      if (this._path === "id 793") return "793";

      return "0";
    });

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "id 123") return "live_set tracks 0 devices 0";

      return this._path;
    });

    // Division param setup: raw values -6 to 0 map to "1/64" to "1"
    liveApiGet.mockImplementation(function (this: MockLiveAPIContext, prop) {
      if (this._path === "id 793") {
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [-3]; // "1/8"
        if (prop === "min") return [-6];
        if (prop === "max") return [0];
      }

      if (prop === "is_quantized") return [0];

      return [0];
    });

    const divisionMap: Record<string, string> = {
      "-6": "1/64",
      "-5": "1/32",
      "-4": "1/16",
      "-3": "1/8",
      "-2": "1/4",
      "-1": "1/2",
      "0": "1",
    };

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method,
      value,
    ) {
      if (method === "str_for_value" && this._path === "id 793") {
        return divisionMap[String(value)] ?? String(value);
      }

      return String(value);
    });
  });

  it("should set raw value for division param by matching label", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"793": "1/16"}',
    });

    // "1/16" maps to raw value -4
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 793" }),
      "value",
      -4,
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle setting division to max value (1)", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"793": "1"}',
    });

    // "1" maps to raw value 0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 793" }),
      "value",
      0,
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should log error for invalid division value", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"793": "1/128"}',
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateDevice: "1/128" is not a valid division option',
    );
    expect(liveApiSet).not.toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "id 793" }),
      "value",
      expect.anything(),
    );
    expect(result).toStrictEqual({ id: "123" });
  });
});
