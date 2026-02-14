// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "./update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

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
      properties: { is_quantized: 0, value: -3, min: -6, max: 0 },
      methods: {
        str_for_value: (value: unknown) =>
          divisionMap[String(value)] ?? String(value),
      },
    });
  });

  it("should set raw value for division param by matching label", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"793": "1/16"}',
    });

    // "1/16" maps to raw value -4
    expect(param.set).toHaveBeenCalledWith("value", -4);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle setting division to max value (1)", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"793": "1"}',
    });

    // "1" maps to raw value 0
    expect(param.set).toHaveBeenCalledWith("value", 0);
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
    expect(param.set).not.toHaveBeenCalledWith("value", expect.anything());
    expect(result).toStrictEqual({ id: "123" });
  });
});
