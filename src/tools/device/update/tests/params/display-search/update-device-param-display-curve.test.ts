// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  expectValueSet,
  registerDeviceWithParams,
  registerMockObject,
  updateDevice,
} from "../../update-device-test-helpers.ts";

// Looplet's Volume: raw -70..6 reads "-inf dB".."6.0 dB", but the curve in
// between is nowhere near a line (raw -12 reads 0.1 dB, raw -40 reads -12 dB).
// Both ends match the raw range, which used to pass as linear.
const VOLUME_CURVE: [raw: number, db: number][] = [
  [-70, -100],
  [-40, -12],
  [-27.14, -6],
  [-20, -3],
  [-12, 0.1],
  [-6, 2.2],
  [0, 4.1],
  [6, 6],
];

function volumeDb(raw: number): number {
  const i = VOLUME_CURVE.findIndex(([r]) => r >= raw);
  const [r1, d1] = VOLUME_CURVE[Math.max(i, 1) - 1] as [number, number];
  const [r2, d2] = VOLUME_CURVE[Math.max(i, 1)] as [number, number];

  return d1 + ((raw - r1) / (r2 - r1)) * (d2 - d1);
}

function volumeLabel(raw: number): string {
  // "+ 0" turns -0 into 0, which toFixed would print as "-0.0".
  const db = Math.round(volumeDb(raw) * 10) / 10 + 0;

  return raw <= -70 ? "-inf dB" : `${db.toFixed(1)} dB`;
}

function registerParam(
  name: string,
  min: number,
  max: number,
  strForValue: (raw: number) => string,
  calls: number[] = [],
): RegisteredMockObject {
  registerDeviceWithParams("curve-param");

  return registerMockObject("curve-param", {
    properties: {
      name,
      original_name: name,
      is_quantized: 0,
      value: min,
      min,
      max,
    },
    methods: {
      str_for_value: (v: unknown) => {
        calls.push(Number(v));

        return strForValue(Number(v));
      },
    },
  });
}

describe("updateDevice - a param that curves between matching ends", () => {
  it("searches for the raw value instead of writing the display value", () => {
    const param = registerParam("Volume 2", -70, 6, volumeLabel);

    updateDevice({ id: "dev1", params: [{ name: "Volume 2", value: "-12" }] });

    const written = expectValueSet(param);

    // Writing -12 as raw would read 0.1 dB.
    expect(Math.round(volumeDb(written) * 10) / 10).toBe(-12);
    expect(written).toBeCloseTo(-40, 1);
  });

  it("lands on the right raw value across the curve", () => {
    const param = registerParam("Volume 2", -70, 6, volumeLabel);

    for (const target of [-6, -3, 0, 2, 4, 6]) {
      param.set.mockClear();
      updateDevice({
        id: "dev1",
        params: [{ name: "Volume 2", value: String(target) }],
      });

      expect(Math.abs(volumeDb(expectValueSet(param)) - target)).toBeLessThan(
        0.06,
      );
    }
  });
});

describe("updateDevice - a linear param", () => {
  it("writes straight through without searching", () => {
    const calls: number[] = [];
    const param = registerParam(
      "Threshold",
      -40,
      0,
      (raw) => `${raw.toFixed(2)} dB`,
      calls,
    );

    updateDevice({
      id: "dev1",
      params: [{ name: "Threshold", value: "-12.5" }],
    });

    expect(expectValueSet(param)).toBe(-12.5);
    // A search is dozens of calls; the shortcut needs the ends and the middle.
    expect(calls.length).toBeLessThan(15);
    expect(calls).toStrictEqual(expect.arrayContaining([-20]));
  });

  it("stays linear when labels are rounded to whole units", () => {
    const calls: number[] = [];
    const param = registerParam(
      "Steps",
      0,
      10,
      (raw) => String(Math.round(raw)),
      calls,
    );

    updateDevice({ id: "dev1", params: [{ name: "Steps", value: "3.3" }] });

    expect(expectValueSet(param)).toBe(3.3);
    expect(calls.length).toBeLessThan(15);
  });

  it("keeps the shortcut when an interior label isn't a number", () => {
    const param = registerParam("Mode Mix", 0, 10, (raw) =>
      raw === 5 ? "mid" : raw.toFixed(2),
    );

    updateDevice({ id: "dev1", params: [{ name: "Mode Mix", value: "3.3" }] });

    expect(expectValueSet(param)).toBe(3.3);
  });
});
