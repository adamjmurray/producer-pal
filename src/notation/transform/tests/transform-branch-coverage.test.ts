// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";
import { evaluateTransformAST } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { type TransformAssignment } from "#src/notation/transform/parser/transform-parser.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import * as barBeatTime from "#src/notation/barbeat/time/barbeat-time.ts";
import { createContext } from "./evaluator/transform-evaluator-test-helpers.ts";

// The note the scalar evaluator is asked about in these branch tests.
const NOTE_PROPERTIES = { pitch: 60, velocity: 100 };

// A single `velocity = 127` assignment, optionally gated by a pitch or time
// range — the AST shape the parser produces for a range-selected line.
function velocitySetAST(
  gate: Pick<TransformAssignment, "pitchRange" | "timeRange"> = {},
): TransformAssignment[] {
  return [
    {
      parameter: "velocity" as const,
      operator: "set" as const,
      pitchRange: gate.pitchRange ?? null,
      timeRange: gate.timeRange ?? null,
      expression: { type: "number" as const, value: 127 },
    },
  ] as unknown as TransformAssignment[];
}

describe("Transform Branch Coverage", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("transform-evaluator.js branch coverage", () => {
    it("handles malformed bar|beat string from abletonBeatsToBarBeat", () => {
      // Mock abletonBeatsToBarBeat to return malformed string
      vi.spyOn(barBeatTime, "abletonBeatsToBarBeat").mockReturnValue(
        "malformed",
      );

      const result = evaluateTransform(
        "velocity += 50",
        createContext(),
        NOTE_PROPERTIES,
      );

      // Should still work, just bar and beat will be null
      expect(result.velocity).toBeDefined();
      expect(result.velocity!.value).toBe(50);
    });

    it("handles empty bar|beat string from abletonBeatsToBarBeat", () => {
      vi.spyOn(barBeatTime, "abletonBeatsToBarBeat").mockReturnValue("");

      const result = evaluateTransform(
        "velocity += 30",
        createContext({ position: 2 }),
        NOTE_PROPERTIES,
      );

      // Should still work despite malformed bar|beat
      expect(result.velocity).toBeDefined();
      expect(result.velocity!.value).toBe(30);
    });
  });

  describe("transform-functions.js branch coverage", () => {
    it("handles ramp with zero time range duration (end = start)", () => {
      // When timeRange.end === timeRange.start, duration is 0, phase should default to 0
      const result = evaluateTransform(
        "velocity += ramp(0, 100)",
        createContext({ position: 5, clipTimeRange: { start: 5, end: 5 } }),
        NOTE_PROPERTIES,
      );

      // Should work despite zero duration
      expect(result.velocity).toBeDefined();
      expect(typeof result.velocity!.value).toBe("number");
    });

    it("handles ramp with negative time range duration (end < start)", () => {
      // When timeRange.end < timeRange.start, duration is negative, phase should default to 0
      const result = evaluateTransform(
        "velocity += ramp(20, 80)",
        createContext({ position: 3, clipTimeRange: { start: 10, end: 2 } }),
        NOTE_PROPERTIES,
      );

      // Should work despite negative duration
      expect(result.velocity).toBeDefined();
      expect(typeof result.velocity!.value).toBe("number");
    });
  });

  describe("transform-evaluator-helpers.js branch coverage", () => {
    it("handles assignment with pitch range that filters out the note", () => {
      // When a note is outside the pitch range, assignment is skipped
      // and assignmentResult.value will be null/undefined
      const result = evaluateTransformAST(
        velocitySetAST({ pitchRange: { startPitch: 70, endPitch: 80 } }),
        createContext({ pitch: 60 }), // C4 - outside the C5..G#5 range
        { pitch: 60 },
      );

      // Assignment should be skipped, result should not have velocity
      expect(result.velocity).toBeUndefined();
    });

    it("handles assignment with time range that filters out the note", () => {
      // When a note is outside the time range, assignment is skipped
      const result = evaluateTransformAST(
        velocitySetAST({
          timeRange: { startBar: 2, startBeat: 1, endBar: 3, endBeat: 1 },
        }),
        createContext({ bar: 1, beat: 1 }), // before the time range starts
        { pitch: 60 },
      );

      // Assignment should be skipped
      expect(result.velocity).toBeUndefined();
    });

    it("handles assignment that skips due to pitch filtering", () => {
      // This tests the branch where assignmentResult.value is null
      // because the assignment was skipped and continues to next iteration
      const result = evaluateTransformAST(
        velocitySetAST({ pitchRange: { startPitch: 70, endPitch: 80 } }),
        createContext({ pitch: 60 }), // outside the pitch range
        { pitch: 60 },
      );

      // Assignment was skipped, so velocity should not be in result
      expect(result.velocity).toBeUndefined();
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("skips note-count ops in per-note evaluation", () => {
      // Note-count ops (ratchet/merge/split/repeat) act on the whole note list,
      // so the per-note evaluator must skip them (they carry no scalar result).
      // applyTransforms routes note ops separately, so this per-note path is
      // only reached by calling the evaluator directly with a note op present.
      const ast = [{ kind: "noteOp", name: "ratchet", args: [] }];

      const result = evaluateTransformAST(
        ast as unknown as TransformAssignment[],
        createContext({ pitch: 60 }),
        { pitch: 60 },
      );

      // The note op is skipped, contributing no parameter results.
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
