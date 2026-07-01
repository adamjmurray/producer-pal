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

  it("routes to midi-json (returns a compact JS-literal array string)", () => {
    const result = formatNotation([note], {
      notation: "midi-json",
      timeSigDenominator: 4,
    });

    // Short keys, defaults (vd/c) omitted.
    expect(result).toBe("[{p:60,t:0,d:4,v:100}]");
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
    expect(resolveNotation("abstark")).toBe("abstark");
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

describe("interpretNotation abstark routing", () => {
  it("routes to Abstark when notation is abstark", () => {
    const notes = interpretNotation("kick: X.X.", {
      notation: "abstark",
    });

    expect(notes).toHaveLength(2);
    expect(notes[0]?.pitch).toBe(36); // kick = MIDI 36
    expect(notes[0]?.start_time).toBe(0);
    expect(notes[1]?.start_time).toBe(0.5); // 2 × 16th = 0.5 beats
  });

  it("interprets melody with literal pitch", () => {
    const notes = interpretNotation("melody: C D Eb", {
      notation: "abstark",
    });

    expect(notes).toHaveLength(3);
    expect(notes[0]?.pitch).toBe(60); // C3 = MIDI 60
    expect(notes[1]?.pitch).toBe(62); // D3 = MIDI 62
    expect(notes[2]?.pitch).toBe(63); // Eb3 = MIDI 63
  });
});

describe("formatNotation abstark routing", () => {
  it("routes to Abstark serializer when notation is abstark", () => {
    const note = {
      pitch: 60,
      start_time: 0,
      duration: 1,
      velocity: 100,
      probability: 1,
    };

    const result = formatNotation([note], { notation: "abstark" });

    expect(result).toContain("melody:");
    expect(result).toContain("C");
    expect(result).toContain("/4");
  });

  it("returns empty string for no notes", () => {
    expect(formatNotation([], { notation: "abstark" })).toBe("");
    expect(formatNotation(null, { notation: "abstark" })).toBe("");
  });
});
