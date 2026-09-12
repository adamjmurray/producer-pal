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

    const landed = setParamValueAndVerify(paramApi(), 0.8, 'param "Drive"');

    expect(landed).toBe(true);
    expect(param.set).toHaveBeenCalledWith("value", 0.8);
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("warns when Live ignores the write", () => {
    // Live drops a value outside the parameter's range without saying so.
    const param = registerLabeledParam();

    param.set.mockImplementation(() => undefined);

    const landed = setParamValueAndVerify(paramApi(), 99, 'param "Drive"');

    expect(landed).toBe(false);
    expect(capturedWarnings()).toContain(
      'param "Drive" was not changed — it still reads "0.50". Live ignores a value outside the parameter\'s range.',
    );
  });

  // The next two guard the mock registry's default str_for_value, which has to
  // discriminate in both directions. A constant makes every write look like it
  // landed; an unrounded value makes every fractional write look ignored,
  // because the mock stores what Live stores and that is never what we wrote.
  it("stays silent for a fractional write, without a str_for_value fixture", () => {
    registerParam({ value: 0.5 });

    const landed = setParamValueAndVerify(paramApi(), 0.1, 'param "Volume"');

    expect(landed).toBe(true);
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("warns when Live ignores the write, without a str_for_value fixture", () => {
    const param = registerParam({ value: 0.5 });

    param.set.mockImplementation(() => undefined);

    const landed = setParamValueAndVerify(paramApi(), 99, 'param "Volume"');

    expect(landed).toBe(false);
    expect(capturedWarnings()).toContain(
      'param "Volume" was not changed — it still reads "0.5". Live ignores a value outside the parameter\'s range.',
    );
  });

  it("compares labels, because the raw value read back is never the one we wrote", () => {
    // Live rounds to six significant digits and keeps a 32-bit float, so 0.1
    // reads back as 0.10000000149011612. Comparing raw values would warn on
    // every fractional write.
    const param = registerLabeledParam();

    setParamValueAndVerify(paramApi(), 0.1, 'param "Drive"');

    expect(param.properties.value).not.toBe(0.1);
    expect(capturedWarnings()).toHaveLength(0);
  });

  // Measured on Live 12.4.3 at a real display boundary on a track's volume.
  // Predicting the stored value with Math.fround lands on the far side of the
  // boundary and warns about a write that went in exactly as asked.
  it("stays silent for a write that lands right on a display boundary", () => {
    registerMockObject("param-1", {
      path: paramPath,
      type: "DeviceParameter",
      properties: { name: "Volume", value: 0.5 },
      methods: {
        str_for_value: (v: unknown) =>
          Number(v) < 0.7000125 ? "-6.0 dB" : "-5.999 dB",
      },
    });

    const landed = setParamValueAndVerify(
      paramApi(),
      0.7000124999999999,
      'param "Volume"',
    );

    expect(landed).toBe(true);
    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("warnParamDisabled", () => {
  it("names the parameter and points at the macro", () => {
    warnParamDisabled("gainDb");

    expect(capturedWarnings()).toContain(
      "gainDb is disabled and was not changed — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.",
    );
  });
});
