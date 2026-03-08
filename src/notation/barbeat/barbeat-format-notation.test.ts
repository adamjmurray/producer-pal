// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.ts";
import { type NoteEvent } from "../types.ts";
import {
  drumPatternNotation,
  drumPatternNotes,
} from "./barbeat-test-fixtures.ts";
import { formatNotation } from "./barbeat-format-notation.ts";
import { interpretNotation } from "./interpreter/barbeat-interpreter.ts";

/**
 * Backward-compatibility tests for the re-export shim.
 * Verifies the public import path still works after the serializer refactor.
 * Full behavior coverage is in serializer/tests/barbeat-serializer-core.test.ts.
 */
describe("bar|beat formatNotation() re-export shim", () => {
  it("handles empty and null input", () => {
    expect(formatNotation([])).toBe("");
    expect(formatNotation(null)).toBe("");
    expect(formatNotation(undefined)).toBe("");
  });

  it("formats notes with state changes", () => {
    const notes = [
      createNote({ velocity: 80, duration: 0.5, probability: 0.8 }),
      createNote({
        pitch: 62,
        start_time: 1,
        velocity: 120,
        duration: 2,
        probability: 0.6,
      }),
    ] as NoteEvent[];

    expect(formatNotation(notes)).toBe(
      "v80 t/2 p0.8 C3 1|1 v120 t2 p0.6 D3 1|2",
    );
  });

  it("handles drum pattern fixture", () => {
    expect(formatNotation(drumPatternNotes)).toBe(drumPatternNotation);
  });

  it("round-trips with interpretNotation", () => {
    const original = "1|1 p0.8 v80-120 t0.5 C3 D3 1|2.25 v120 p1.0 t2 E3 F3";
    const parsed = interpretNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = interpretNotation(formatted);

    expect(parsed).toStrictEqual(reparsed);
  });
});
