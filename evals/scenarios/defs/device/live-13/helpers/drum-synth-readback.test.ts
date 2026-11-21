// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { drumSynthProblem } from "./drum-synth-readback.ts";

/**
 * @param decay - What Decay reads as
 * @param soundType - What Sound Type reads as
 * @returns A read-device result
 */
const read = (decay: string, soundType: string): unknown => ({
  parameters: [
    { name: "Sound Type", value: soundType },
    { name: "Decay", value: decay },
    { name: "Snare TR Snap", value: "75", state: "inactive" },
  ],
});

describe("drumSynthProblem", () => {
  it("accepts a Decay of 60 on a Kick", () => {
    expect(drumSynthProblem(read("60 %", "Kick"))).toBeNull();
  });

  it("names a Decay that did not change", () => {
    expect(drumSynthProblem(read("30 %", "Kick"))).toBe(
      "Decay reads 30, wanted 60",
    );
  });

  it("names a switched sound type", () => {
    expect(drumSynthProblem(read("60 %", "Snare"))).toBe(
      "Sound Type reads Snare, wanted Kick",
    );
  });

  it("names both when both are wrong, and a read with neither", () => {
    expect(drumSynthProblem(read("30 %", "Snare"))).toMatch(
      /Decay.*; Sound Type/,
    );
    expect(drumSynthProblem({})).toBe(
      "Decay reads no number, wanted 60; Sound Type reads nothing, wanted Kick",
    );
  });
});
