// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  isParamEnabled,
  setParamIfEnabled,
  warnParamDisabled,
} from "../param-write-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

const paramPath = `${livePath.track(0).device(0)} parameters 0`;

/**
 * Register a device parameter at track 0 / device 0 / parameter 0
 * @param properties - Properties to register (omit is_enabled to leave it unreported)
 * @returns The registered parameter
 */
function registerParam(
  properties: Record<string, unknown> = {},
): RegisteredMockObject {
  return registerMockObject("param-1", {
    path: paramPath,
    type: "DeviceParameter",
    properties: { name: "Volume", ...properties },
  });
}

/**
 * Point a fresh LiveAPI at the registered parameter
 * @returns The parameter object
 */
function paramApi(): LiveAPI {
  return LiveAPI.from(paramPath);
}

describe("isParamEnabled", () => {
  it("is true when Live reports the parameter as enabled", () => {
    registerParam({ is_enabled: 1 });

    expect(isParamEnabled(paramApi())).toBe(true);
  });

  it("is false when Live reports the parameter as disabled", () => {
    registerParam({ is_enabled: 0 });

    expect(isParamEnabled(paramApi())).toBe(false);
  });

  it("is true when the object doesn't report is_enabled at all", () => {
    registerParam();

    expect(isParamEnabled(paramApi())).toBe(true);
  });
});

describe("setParamIfEnabled", () => {
  it("writes the value and reports success when the parameter is enabled", () => {
    const param = registerParam({ is_enabled: 1 });

    expect(setParamIfEnabled(paramApi(), "display_value", -6, "gainDb")).toBe(
      true,
    );
    expect(param.set).toHaveBeenCalledWith("display_value", -6);
    expect(outlet).not.toHaveBeenCalled();
  });

  it("skips the write and warns when the parameter is disabled", () => {
    const param = registerParam({ is_enabled: 0 });

    expect(
      setParamIfEnabled(paramApi(), "value", 0.5, 'chain "Kick" pan'),
    ).toBe(false);
    expect(param.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('chain "Kick" pan is disabled'),
    );
  });
});

describe("warnParamDisabled", () => {
  it("names the parameter and points at the macro", () => {
    warnParamDisabled("updateTrack: gainDb");

    expect(outlet).toHaveBeenCalledWith(
      1,
      "updateTrack: gainDb is disabled and was not changed — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.",
    );
  });
});
