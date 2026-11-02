// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  applyTransforms,
  tryParseTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import { createTestNote } from "../evaluator/transform-evaluator-test-helpers.ts";

describe("a waveform period that uses a note property", () => {
  it.each([
    ["velocity = 80 + 30*sin(note.start * 6.28318530718)", "sin", "note.start"],
    ["velocity = 90 + 20 * sin(note.start + 0.5)", "sin", "note.start"],
    ["velocity = 64 + 30 * cos(note.pitch)", "cos", "note.pitch"],
    ["velocity = tri(note.index)", "tri", "note.index"],
    ["velocity = saw(note.duration / 2)", "saw", "note.duration"],
    ["velocity = square(next.start, 0, 0.25)", "square", "next.start"],
    ["velocity = sin(abs(rand() + note.velocity))", "sin", "note.velocity"],
    ["velocity = 1 + min(10, sin(note.count))", "sin", "note.count"],
  ])("is refused: %s", (transform, fn, property) => {
    expect(() => tryParseTransform(transform, 4, 4)).toThrow(
      `${fn}() period is a cycle length (e.g. ${fn}(n/4) or ${fn}(1bar)), not radians, so it can't use ${property}; put per-note variation in the phase (2nd argument)`,
    );
  });

  it("is refused inside a where() predicate", () => {
    expect(() =>
      tryParseTransform("where(sin(note.start) > 0): velocity = 80", 4, 4),
    ).toThrow("sin() period is a cycle length");
  });

  it("is refused inside a nested waveform and a note op argument", () => {
    expect(() =>
      tryParseTransform("velocity = sin(1bar + sin(note.pitch))", 4, 4),
    ).toThrow("sin() period is a cycle length");
    expect(() =>
      tryParseTransform("ratchet(2 + sin(note.pitch))", 4, 4),
    ).toThrow("sin() period is a cycle length");
  });

  it("is accepted with an audio variable in an audio transform", () => {
    expect(() =>
      tryParseTransform("gain = sin(audio.gain)", 4, undefined, "audio"),
    ).not.toThrow();
    expect(() =>
      tryParseTransform(
        "gain = sin(audio.pitchShift + n/4)",
        4,
        undefined,
        "audio",
      ),
    ).not.toThrow();
  });

  it("is refused for an audio transform", () => {
    expect(() =>
      tryParseTransform(
        "gain = -6 + 3 * sin(note.start)",
        4,
        undefined,
        "audio",
      ),
    ).toThrow("sin() period is a cycle length");
  });

  it("changes no notes when refused", () => {
    const notes = createTestNote({ velocity: 100, start_time: 1 });

    expect(() =>
      applyTransforms(
        notes,
        "velocity = 90 + 20 * sin(note.start + 0.5)",
        4,
        4,
      ),
    ).toThrow("sin() period is a cycle length");
    expect(notes[0]?.velocity).toBe(100);
  });
});

describe("a waveform period that is fine", () => {
  it.each([
    "velocity = 80 + 30 * sin(n/4)",
    "velocity = 80 + 30 * cos(1bar, sync)",
    "velocity = sin(-n/4)",
    "velocity = sin(0)",
    "velocity = tri(n/4, note.start / 4)",
    "velocity = square(n/4, 0, note.velocity / 127)",
    "velocity = sin(clip.barDuration)",
    "velocity = sin(clip.position + n/4)",
    "velocity = sin(seq(n/4, n/2))",
    "velocity = sin(rand(1, 4))",
    "velocity = sin(choose(n/4, n/2))",
    "velocity = 100 - note.start * sin(n/4)",
    "where(note.start > 2): velocity = ramp(0, 100)",
  ])("is accepted: %s", (transform) => {
    expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
  });
});
