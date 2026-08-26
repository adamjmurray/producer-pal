// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  expectValueSet,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

// A non-linear dB param, like Saturator's Drive: raw 0–1 maps to -36..+36 dB
// and the display rounds to 0.1 dB steps, so each step is 1/720 of the raw
// range. Live snaps what you write to its own resolution, so a raw value on a
// step boundary reads back one step off. Math.fround models the snap — Live is
// this coarse at best, and coarser on some params.
const STEP = 1 / 720;

function displayFor(raw: number): number {
  return Math.round((raw * 72 - 36) * 10) / 10;
}

function registerDbParam(): RegisteredMockObject {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children("db-param") },
  });

  return registerMockObject("db-param", {
    properties: {
      name: "Drive",
      original_name: "Drive",
      is_quantized: 0,
      value: 0.5,
      min: 0,
      max: 1,
    },
    methods: {
      str_for_value: (v: unknown) => `${displayFor(Number(v)).toFixed(1)} dB`,
    },
  });
}

describe("updateDevice - display-value search", () => {
  let param: RegisteredMockObject;

  beforeEach(() => {
    param = registerDbParam();
  });

  it("lands in the middle of the requested display step, not on its edge", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "2.3" }] });

    const written = expectValueSet(param);

    expect(displayFor(written)).toBe(2.3);
    // Middle of the step, so 32-bit rounding can't push it into a neighbor.
    expect(displayFor(Math.fround(written))).toBe(2.3);
    expect(Math.abs(written - (36 + 2.25) / 72)).toBeGreaterThan(STEP / 4);
  });

  it("hits every step across the range", () => {
    for (let tenths = -359; tenths <= 359; tenths++) {
      const target = (tenths / 10).toFixed(1);

      param.set.mockClear();
      updateDevice({ id: "dev1", params: [{ name: "Drive", value: target }] });

      expect(displayFor(Math.fround(expectValueSet(param)))).toBe(
        Number(target),
      );
    }
  });

  it("clamps to the raw max when the target is above the display range", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "99" }] });

    expect(expectValueSet(param)).toBe(1);
  });

  it("stays inside the bottom step when the target is below the display range", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "-99" }] });

    expect(displayFor(Math.fround(expectValueSet(param)))).toBe(-36);
  });
});
