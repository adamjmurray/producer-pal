// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// How readParameter reports a range whose end is a word (Glue Compressor's
// Release reads "A" for Auto). Split from device-display-helpers.test.ts to
// keep both files under the line limit.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readParameter } from "../device-display-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

const paramPath = `${livePath.track(0).device(0)} parameters 0`;
const STEPS = [0.1, 0.2, 0.4, 0.6, 0.8, 1.2];

/**
 * Register Glue Compressor's Release at a raw value and read it.
 * @param value - Raw value the parameter currently holds
 * @returns The readParameter result
 */
function readRelease(value: number): Record<string, unknown> {
  registerMockObject("param-1", {
    path: paramPath,
    type: "DeviceParameter",
    properties: {
      name: "Release",
      original_name: "Release",
      is_quantized: 0,
      is_enabled: 1,
      state: 0,
      automation_state: 0,
      value,
      min: 0,
      max: 6,
    },
    methods: {
      str_for_value: (v: unknown) => {
        const raw = Number(v);

        return raw >= 6 ? "A" : String(STEPS[Math.floor(raw)]);
      },
    },
  });

  return readParameter(LiveAPI.from(paramPath));
}

describe("readParameter on a range ending in a word", () => {
  it("reports the range the parameter can actually display", () => {
    const result = readRelease(2);

    // Before, max fell back to the raw 6 — a value the parameter never shows,
    // so a model would ask for values that cannot exist.
    expect(result.min).toBe(0.1);
    expect(result.max).toBe(1.2);
    expect(result.value).toBe(0.4);
  });

  it("names the word so it stays settable", () => {
    expect(readRelease(2).alsoAccepts).toBe("A");
  });

  it("reports the word as the value when the parameter is on it", () => {
    expect(readRelease(6).value).toBe("A");
  });

  it("says nothing extra for an ordinary range", () => {
    registerMockObject("param-1", {
      path: paramPath,
      type: "DeviceParameter",
      properties: {
        name: "Threshold",
        original_name: "Threshold",
        is_quantized: 0,
        is_enabled: 1,
        state: 0,
        automation_state: 0,
        value: -12,
        min: -40,
        max: 0,
      },
      methods: {
        str_for_value: (v: unknown) => `${Number(v).toFixed(1)} dB`,
      },
    });

    const result = readParameter(LiveAPI.from(paramPath));

    expect(result.alsoAccepts).toBeUndefined();
    expect(result).toMatchObject({ min: -40, max: 0, value: -12, unit: "dB" });
  });
});
