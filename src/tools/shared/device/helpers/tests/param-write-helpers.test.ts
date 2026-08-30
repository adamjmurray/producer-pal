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
  setParamValueAndVerify,
  warnParamDisabled,
} from "../param-write-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("skips the write and warns when the parameter is disabled", () => {
    const param = registerParam({ is_enabled: 0 });

    expect(
      setParamIfEnabled(paramApi(), "value", 0.5, 'chain "Kick" pan'),
    ).toBe(false);
    expect(param.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('chain "Kick" pan is disabled'),
    );
  });
});

describe("setParamValueAndVerify", () => {
  /**
   * Register a parameter whose label is the raw value rounded to two decimals,
   * so a write that lands and one that doesn't produce different labels.
   * @returns The registered parameter
   */
  function registerLabeledParam(): RegisteredMockObject {
    return registerMockObject("param-1", {
      path: paramPath,
      type: "DeviceParameter",
      properties: { name: "Drive", value: 0.5 },
      methods: { str_for_value: (v: unknown) => Number(v).toFixed(2) },
    });
  }

  it("stays silent when the value lands", () => {
    const param = registerLabeledParam();

    const landed = setParamValueAndVerify(
      paramApi(),
      0.8,
      'updateDevice: param "Drive"',
    );

    expect(landed).toBe(true);
    expect(param.set).toHaveBeenCalledWith("value", 0.8);
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("warns when Live ignores the write", () => {
    // Live drops a value outside the parameter's range without saying so.
    const param = registerLabeledParam();

    param.set.mockImplementation(() => undefined);

    const landed = setParamValueAndVerify(
      paramApi(),
      99,
      'updateDevice: param "Drive"',
    );

    expect(landed).toBe(false);
    expect(capturedWarnings()).toContain(
      'updateDevice: param "Drive" was not changed — it still reads "0.50". Live ignores a value outside the parameter\'s range.',
    );
  });

  it("compares against what Live stores, not what we wrote", () => {
    // Live keeps a 32-bit float, so 0.1 reads back as 0.10000000149011612. A
    // check against the unrounded write would warn on every fractional value.
    const param = registerLabeledParam();

    setParamValueAndVerify(paramApi(), 0.1, 'updateDevice: param "Drive"');

    expect(param.properties.value).toBe(Math.fround(0.1));
    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("warnParamDisabled", () => {
  it("names the parameter and points at the macro", () => {
    warnParamDisabled("updateTrack: gainDb");

    expect(capturedWarnings()).toContain(
      "updateTrack: gainDb is disabled and was not changed — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.",
    );
  });
});
