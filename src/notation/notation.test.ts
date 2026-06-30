// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  formatNotation,
  interpretNotation,
  resolveNotation,
} from "./notation.ts";

describe("interpretNotation router", () => {
  it("defaults to barbeat when no notation is given", () => {
    const result = interpretNotation("C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.pitch).toBe(60);
    expect(result[0]?.start_time).toBe(0);
  });

  it("routes to barbeat explicitly", () => {
    const result = interpretNotation("C3 1|1", {
      notation: "barbeat",
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result[0]?.pitch).toBe(60);
  });

  it("routes to midi-json", () => {
    const result = interpretNotation(
      '[{"pitch":60,"start":0,"duration":4,"velocity":100}]',
      { notation: "midi-json", timeSigDenominator: 4 },
    );

    expect(result[0]?.pitch).toBe(60);
    expect(result[0]?.duration).toBe(4);
  });
});

describe("formatNotation router", () => {
  const note = {
    pitch: 60,
    start_time: 0,
    duration: 4,
    velocity: 100,
    velocity_deviation: 0,
    probability: 1,
  };

  it("defaults to barbeat (returns bar|beat text, not JSON)", () => {
    const result = formatNotation([note], {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toContain("1|1");
    expect(result.startsWith("[")).toBe(false);
  });

  it("routes to midi-json (returns a JSON array string)", () => {
    const result = formatNotation([note], {
      notation: "midi-json",
      timeSigDenominator: 4,
    });

    expect(JSON.parse(result)).toStrictEqual([
      {
        pitch: 60,
        start: 0,
        duration: 4,
        velocity: 100,
        velocityDeviation: 0,
        probability: 1,
      },
    ]);
  });

  it("handles null/empty notes", () => {
    expect(formatNotation(null, { notation: "midi-json" })).toBe("");
    expect(formatNotation([], {})).toBe("");
  });

  it("falls back to bar|beat for stark (no Stark serializer)", () => {
    const result = formatNotation([note], {
      notation: "stark",
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(result).toContain("1|1");
    expect(result.startsWith("[")).toBe(false);
  });
});

describe("resolveNotation", () => {
  it("returns the given notation when one is provided", () => {
    expect(resolveNotation("midi-json")).toBe("midi-json");
    expect(resolveNotation("barbeat")).toBe("barbeat");
    expect(resolveNotation("stark")).toBe("stark");
  });

  it("defaults to barbeat when no notation is given", () => {
    expect(resolveNotation(undefined)).toBe("barbeat");
  });
});

describe("interpretNotation stark routing", () => {
  it("routes to Stark when notation is stark", () => {
    const notes = interpretNotation("kick: X x X x", {
      notation: "stark",
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });

    expect(notes).toHaveLength(4);
    expect(notes[0]?.pitch).toBe(36); // Stark kick = C1
  });
});
