// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { validateAndSanitizeNote } from "./midi-json-note.ts";

// The reason strings are user-facing: interpretMidiJson relays them to the model
// in a WARNING: block, so an empty or wrong one is a silent drop again by
// another name. Pinned here rather than only through the aggregated warning,
// which can't reach every branch (the parser never yields a non-object).
describe("validateAndSanitizeNote() rejection reasons", () => {
  it("rejects a non-object", () => {
    expect(validateAndSanitizeNote(null)).toStrictEqual({
      valid: false,
      reason: "not an object",
    });
    expect(validateAndSanitizeNote(42)).toStrictEqual({
      valid: false,
      reason: "not an object",
    });
  });

  it("rejects a missing or non-numeric pitch/start", () => {
    expect(validateAndSanitizeNote({ start: 0 })).toStrictEqual({
      valid: false,
      reason: "missing or non-numeric p/t",
    });
    // A numeric STRING is not a number: Number.isFinite never coerces, which is
    // what lets hasPitchAndStart drop the redundant typeof check.
    expect(validateAndSanitizeNote({ pitch: "60", start: 0 })).toStrictEqual({
      valid: false,
      reason: "missing or non-numeric p/t",
    });
    expect(
      validateAndSanitizeNote({ pitch: Number.NaN, start: 0 }),
    ).toStrictEqual({ valid: false, reason: "missing or non-numeric p/t" });
  });

  it("rejects a non-finite duration, velocity, or probability", () => {
    expect(
      validateAndSanitizeNote({ pitch: 60, start: 0, duration: Infinity }),
    ).toStrictEqual({ valid: false, reason: "non-finite d, v, or c" });
    expect(
      validateAndSanitizeNote({ pitch: 60, start: 0, velocity: Number.NaN }),
    ).toStrictEqual({ valid: false, reason: "non-finite d, v, or c" });
    expect(
      validateAndSanitizeNote({ pitch: 60, start: 0, probability: Infinity }),
    ).toStrictEqual({ valid: false, reason: "non-finite d, v, or c" });
  });

  it("rejects a zero or negative duration on a real note", () => {
    expect(
      validateAndSanitizeNote({ pitch: 60, start: 0, duration: 0 }),
    ).toStrictEqual({ valid: false, reason: "d must be greater than 0" });
  });

  it("names the pitch when a delete marker is out of range", () => {
    expect(
      validateAndSanitizeNote(
        { pitch: 130, start: 0, velocity: 0 },
        { allowVelocityZero: true },
      ),
    ).toStrictEqual({
      valid: false,
      reason: "delete marker pitch 130 is outside 0-127",
    });
  });

  it("carries no reason when the note is valid", () => {
    const result = validateAndSanitizeNote({ pitch: 60, start: 0 });

    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty("reason");
  });
});
