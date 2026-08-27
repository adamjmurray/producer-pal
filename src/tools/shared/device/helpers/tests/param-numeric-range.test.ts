// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  displayAt,
  numericLabel,
  readNumericRange,
  sentinelRawValue,
} from "../param-numeric-range.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

const paramPath = `${livePath.track(0).device(0)} parameters 0`;

/**
 * Register a parameter with a given label function and point a LiveAPI at it.
 * @param strForValue - Renders a raw value as its display label
 * @returns The parameter object
 */
function paramWithLabels(strForValue: (raw: number) => string): LiveAPI {
  registerMockObject("param-1", {
    path: paramPath,
    type: "DeviceParameter",
    properties: { name: "Release" },
    methods: { str_for_value: (v: unknown) => strForValue(Number(v)) },
  });

  return LiveAPI.from(paramPath);
}

// Glue Compressor's Release: numbers up to 1.2, then the word "A" (Auto) on the
// very top raw value.
const release = (raw: number): string =>
  raw >= 6 ? "A" : String([0.1, 0.2, 0.4, 0.6, 0.8, 1.2][Math.floor(raw)]);

describe("numericLabel", () => {
  it("reads a number out of a label", () => {
    expect(numericLabel("-6.0 dB")).toBe(-6);
  });

  it("rejects a word", () => {
    expect(numericLabel("A")).toBeNull();
  });

  it("rejects a note name, which parses to a string", () => {
    expect(numericLabel("C4")).toBeNull();
  });
});

describe("displayAt", () => {
  it("renders a raw value and reads the number back", () => {
    expect(displayAt(paramWithLabels(release), 3)).toBe(0.6);
  });
});

describe("readNumericRange", () => {
  it("passes an ordinary range through untrimmed", () => {
    const param = paramWithLabels((raw) => `${raw.toFixed(1)} dB`);

    expect(readNumericRange(param, -40, 0, "-40.0 dB", "0.0 dB")).toStrictEqual(
      {
        rawMin: -40,
        rawMax: 0,
        minValue: -40,
        maxValue: 0,
        minLabel: "-40.0 dB",
        maxLabel: "0.0 dB",
        sentinel: null,
      },
    );
  });

  it("trims a word off the max end and keeps it reachable", () => {
    const range = readNumericRange(paramWithLabels(release), 0, 6, "0.1", "A");

    expect(range?.minValue).toBe(0.1);
    expect(range?.maxValue).toBe(1.2);
    expect(range?.maxLabel).toBe("1.2");
    expect(range?.sentinel).toStrictEqual({ label: "A", raw: 6 });
    // Inside the top numeric step, not on its edge, so the search that uses
    // this bound can still land mid-step.
    expect(range?.rawMax).toBeGreaterThan(5);
    expect(range?.rawMax).toBeLessThan(6);
  });

  it("trims a word off the min end", () => {
    const param = paramWithLabels((raw) =>
      raw <= 0 ? "Off" : `${(raw * 100).toFixed(0)} ms`,
    );
    const range = readNumericRange(param, 0, 1, "Off", "100 ms");

    expect(range?.maxValue).toBe(100);
    expect(range?.sentinel).toStrictEqual({ label: "Off", raw: 0 });
    expect(range?.rawMin).toBeGreaterThan(0);
  });

  it("gives up when both ends are words — there is no number line", () => {
    const param = paramWithLabels(() => "Extreme");

    expect(readNumericRange(param, 0, 4, "Off", "Extreme")).toBeNull();
  });

  it("gives up when the word covers the whole range but one end", () => {
    // Only the far end parses, so every probe inward hits the word.
    const param = paramWithLabels((raw) => (raw <= 0 ? "0 ms" : "Off"));

    expect(readNumericRange(param, 0, 1, "0 ms", "Off")).toBeNull();
  });
});

describe("sentinelRawValue", () => {
  const range = readNumericRange(paramWithLabels(release), 0, 6, "0.1", "A");

  it("matches the word, ignoring case and space", () => {
    expect(sentinelRawValue(range!, " a ")).toBe(6);
  });

  it("does not match anything else", () => {
    expect(sentinelRawValue(range!, "Auto")).toBeNull();
  });

  it("is null when the range has no word", () => {
    const plain = readNumericRange(
      paramWithLabels((raw) => `${raw} dB`),
      0,
      1,
      "0 dB",
      "1 dB",
    );

    expect(sentinelRawValue(plain!, "A")).toBeNull();
  });
});
