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

  it("rounds down when the step below the target is closer", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "2.26" }] });

    expect(displayFor(Math.fround(expectValueSet(param)))).toBe(2.3);

    param.set.mockClear();
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "2.24" }] });

    expect(displayFor(Math.fround(expectValueSet(param)))).toBe(2.2);
  });

  it("clamps to the raw max when the target is above the display range", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "99" }] });

    expect(expectValueSet(param)).toBe(1);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateDevice: param "Drive" only goes from -36.0 dB to 36.0 dB, so 99 was set to the closest end.',
    );
  });

  it("stays inside the bottom step when the target is below the display range", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "-99" }] });

    expect(displayFor(Math.fround(expectValueSet(param)))).toBe(-36);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("only goes from -36.0 dB to 36.0 dB"),
    );
  });

  it("says nothing about the range when the target is inside it", () => {
    updateDevice({ id: "dev1", params: [{ name: "Drive", value: "12" }] });

    expect(outlet).not.toHaveBeenCalled();
  });
});

// Glue Compressor's Attack: is_quantized is 0, but only seven displays are
// reachable. A target between rungs is off by a lot no matter which way it
// rounds, so this is where round-up vs. round-to-nearest is visible.
const RUNGS = [0.01, 0.1, 0.3, 1, 3, 10, 30];

function registerLadderParam(): RegisteredMockObject {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children("ladder-param") },
  });

  return registerMockObject("ladder-param", {
    properties: {
      name: "Attack",
      original_name: "Attack",
      is_quantized: 0,
      value: 0,
      min: 0,
      max: 6,
    },
    methods: {
      str_for_value: (v: unknown) =>
        `${RUNGS[Math.min(Math.floor(Number(v)), RUNGS.length - 1)]} ms`,
    },
  });
}

describe("updateDevice - display-value search on a discrete ladder", () => {
  let param: RegisteredMockObject;

  beforeEach(() => {
    param = registerLadderParam();
  });

  function displayAfterWrite(target: string): number {
    param.set.mockClear();
    updateDevice({ id: "dev1", params: [{ name: "Attack", value: target }] });

    return RUNGS[Math.floor(expectValueSet(param))] as number;
  }

  it("picks the nearer rung when the target falls between two", () => {
    expect(displayAfterWrite("2")).toBe(3);
    expect(displayAfterWrite("1.5")).toBe(1);
    expect(displayAfterWrite("25")).toBe(30);
    expect(displayAfterWrite("12")).toBe(10);
  });

  it("rounds a tie up", () => {
    expect(displayAfterWrite("20")).toBe(30);
  });

  it("still hits every rung exactly", () => {
    for (const rung of RUNGS) {
      expect(displayAfterWrite(String(rung))).toBe(rung);
    }
  });
});

function registerLinearParam(): RegisteredMockObject {
  registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children("linear-param") },
  });

  return registerMockObject("linear-param", {
    properties: {
      name: "Threshold",
      original_name: "Threshold",
      is_quantized: 0,
      value: 0,
      min: -40,
      max: 0,
    },
    methods: {
      str_for_value: (v: unknown) => `${Number(v).toFixed(2)} dB`,
    },
  });
}

// A param whose display range matches its raw range skips the search and writes
// the target straight through, so it's the one path that could hand Live a
// value outside the range — which Live drops without a word.
describe("updateDevice - display-value search on a linear param", () => {
  let param: RegisteredMockObject;

  beforeEach(() => {
    param = registerLinearParam();
  });

  it("writes the target straight through when it's in range", () => {
    updateDevice({
      id: "dev1",
      params: [{ name: "Threshold", value: "-12.5" }],
    });

    expect(expectValueSet(param)).toBe(-12.5);
    expect(outlet).not.toHaveBeenCalled();
  });

  it("clamps a target past the range instead of letting Live drop it", () => {
    updateDevice({ id: "dev1", params: [{ name: "Threshold", value: "-99" }] });

    expect(expectValueSet(param)).toBe(-40);

    param.set.mockClear();
    updateDevice({ id: "dev1", params: [{ name: "Threshold", value: "5" }] });

    expect(expectValueSet(param)).toBe(0);
  });
});

// Some params can't be converted at all: Glue Compressor's Release tops out at
// the label "A" (Auto), so there's no display range to search and the request
// goes to Live as a raw value. Live drops one outside the raw range without a
// word, which is what the readback check is for.
describe("updateDevice - a request Live silently drops", () => {
  let param: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("dev1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { parameters: children("auto-param") },
    });

    param = registerMockObject("auto-param", {
      properties: {
        name: "Release",
        original_name: "Release",
        is_quantized: 0,
        value: 3,
        min: 0,
        max: 6,
      },
      methods: {
        str_for_value: (v: unknown) => {
          const raw = Number(v);

          if (raw < 0 || raw > 6) return "";

          return raw >= 6 ? "A" : `${raw.toFixed(1)} s`;
        },
      },
    });

    param.set.mockImplementation((property: string, value: unknown) => {
      const raw = Number(value);

      if (property === "value" && raw >= 0 && raw <= 6) {
        param.properties.value = Math.fround(raw);
      }
    });
  });

  it("warns when the value never changed", () => {
    updateDevice({ id: "dev1", params: [{ name: "Release", value: "10" }] });

    expect(param.properties.value).toBe(3);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateDevice: param "Release" was not changed — it still reads "3.0 s". Live ignores a value outside the parameter\'s range.',
    );
  });

  it("says nothing when the value does change", () => {
    updateDevice({ id: "dev1", params: [{ name: "Release", value: "2" }] });

    expect(param.properties.value).toBe(2);
    expect(outlet).not.toHaveBeenCalled();
  });
});
