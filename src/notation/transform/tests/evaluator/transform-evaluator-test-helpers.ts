// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";
import type { NoteEvent } from "#src/notation/types.ts";

/**
 * Creates a standard test note with common defaults.
 * Allows overriding any property.
 *
 * @param overrides - Optional properties to override defaults
 * @returns Array with a single test note
 */
export function createTestNote(
  overrides: Partial<NoteEvent> = {},
): NoteEvent[] {
  return [
    {
      pitch: 60,
      start_time: 0,
      duration: 1,
      velocity: 100,
      probability: 1,
      ...overrides,
    },
  ];
}

/**
 * Creates multiple test notes with specified properties.
 *
 * @param noteOverrides - Array of property overrides for each note
 * @returns Array of test notes
 */
export function createTestNotes(
  noteOverrides: Partial<NoteEvent>[],
): NoteEvent[] {
  return noteOverrides.map((overrides) => ({
    pitch: 60,
    start_time: 0,
    duration: 1,
    velocity: 100,
    probability: 1,
    ...overrides,
  }));
}

/**
 * Standard 4/4 time signature context for evaluateTransform.
 */
export const DEFAULT_CONTEXT = {
  position: 0,
  timeSig: { numerator: 4, denominator: 4 },
} as const;

/**
 * Creates a context object for evaluateTransform.
 *
 * @param overrides - Context properties to override
 * @param overrides.position - Note position in beats
 * @param overrides.numerator - Time signature numerator
 * @param overrides.denominator - Time signature denominator
 * @param overrides.clipTimeRange - Optional clip time range
 * @param overrides.clipTimeRange.start - Start of clip
 * @param overrides.clipTimeRange.end - End of clip
 * @returns Context object for evaluateTransform
 */
export function createContext(overrides: {
  position?: number;
  numerator?: number;
  denominator?: number;
  clipTimeRange?: { start: number; end: number };
}) {
  return {
    position: overrides.position ?? 0,
    timeSig: {
      numerator: overrides.numerator ?? 4,
      denominator: overrides.denominator ?? 4,
    },
    ...(overrides.clipTimeRange && { clipTimeRange: overrides.clipTimeRange }),
  };
}

/**
 * Tests that a transform string produces an error and returns empty result.
 * Used for testing validation errors in math functions, waveforms, etc.
 *
 * @param transformString - The transform string to test
 */
export function expectTransformError(transformString: string) {
  const result = evaluateTransform(transformString, DEFAULT_CONTEXT);

  expect(result).toStrictEqual({});
  expect(outlet).toHaveBeenCalledWith(1, expect.anything());
}
