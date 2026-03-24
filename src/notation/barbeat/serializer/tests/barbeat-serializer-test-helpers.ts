// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { sortNotes } from "../../barbeat-test-fixtures.ts";
import { interpretNotation } from "../../interpreter/barbeat-interpreter.ts";
import { formatNotation } from "../barbeat-serializer.ts";

/** Tolerance for floating-point comparison (covers fraction round-trip drift) */
const EPSILON = 1e-10;

interface RoundTripOptions {
  timeSigNumerator?: number;
  timeSigDenominator?: number;
  drumMode?: boolean;
  /** Whether to check probability and velocity_deviation (default: true) */
  checkExpressiveFields?: boolean;
}

/**
 * Round-trip helper: notes → serialize → parse → interpret → compare to original.
 * Sorts both arrays for comparison since note order within a time group may vary.
 * @param notes - Notes to round-trip
 * @param options - Serialization and comparison options
 */
export function expectRoundTripNotes(
  notes: NoteEvent[],
  options: RoundTripOptions = {},
): void {
  const { checkExpressiveFields = true, drumMode, ...timeSigOptions } = options;

  const formatted = formatNotation(notes, { ...timeSigOptions, drumMode });
  const reparsed = interpretNotation(formatted, timeSigOptions);
  const sortedOriginal = sortNotes(notes);
  const sortedReparsed = sortNotes(reparsed);

  expect(sortedReparsed).toHaveLength(sortedOriginal.length);

  for (let i = 0; i < sortedOriginal.length; i++) {
    const orig = sortedOriginal[i] as NoteEvent;
    const repr = sortedReparsed[i] as NoteEvent;

    expect(repr.pitch).toBe(orig.pitch);
    expect(repr.start_time).toBeCloseTo(orig.start_time, 8);
    expect(repr.duration).toBeCloseTo(orig.duration, 8);
    expect(repr.velocity).toBeCloseTo(orig.velocity, 8);

    if (checkExpressiveFields) {
      expect(
        Math.abs((repr.probability ?? 1) - (orig.probability ?? 1)),
      ).toBeLessThan(EPSILON);
      expect(
        Math.abs(
          (repr.velocity_deviation ?? 0) - (orig.velocity_deviation ?? 0),
        ),
      ).toBeLessThan(EPSILON);
    }
  }
}
