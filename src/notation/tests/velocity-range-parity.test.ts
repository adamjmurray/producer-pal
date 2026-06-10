// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Cross-layer parity for the `vA-B` velocity range.
//
// Two surfaces accept `vA-B`:
//   1. bar|beat notes layer    — barbeat-grammar.peggy `velocity` rule, mapped
//      to note properties by the barbeat interpreter.
//   2. transform/preTransform shorthand — transform-grammar.peggy `shorthand`
//      rule, desugared to velocity + deviation assignments by the evaluator.
//
// Both must turn an identical token into identical Live note properties
// (base `velocity` + `velocity_deviation`). The layers cannot share code (Peggy
// compiles each grammar separately and cannot import), so the
// min/max → velocity/deviation mapping is duplicated: the barbeat interpreter
// (barbeat-interpreter.ts) vs. the transform grammar's shorthand action. This
// test feeds one corpus through both end-to-end and pins them so they cannot
// silently diverge.
//
// `lo == 0` cases (`v0-N` / `vN-0` / `v0-0`) are rejected at parse time in BOTH
// grammars with a byte-identical targeted error: a velocity-0 base note is the
// delete sentinel, so such a range would silently delete every note it touches.
// Both layers throw rather than desugar — pinned by its own assertion below, a
// stronger parity than the silent-delete agreement it replaced.

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";

// Includes in-range, reversed, equal-bounds, and out-of-range clamp cases.
const TOKENS = [
  "v80-120",
  "v60-100",
  "v100-100", // min == max → deviation 0
  "v120-80", // reversed → swaps
  "v200-250", // both clamp to 127 → deviation 0
  "v10-130", // high bound clamps to 127
  "v1-127", // full usable span
] as const;

interface VelDev {
  velocity: number;
  deviation: number;
}

function viaNotes(token: string): VelDev {
  const notes = interpretNotation(`${token} C3 1|1`);
  const note = notes[0] as NoteEvent;

  return { velocity: note.velocity, deviation: note.velocity_deviation ?? 0 };
}

function viaTransform(token: string): VelDev {
  const notes: NoteEvent[] = [
    { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
  ];

  applyTransforms(notes, token, 4, 4);
  const note = notes[0] as NoteEvent;

  return { velocity: note.velocity, deviation: note.velocity_deviation ?? 0 };
}

describe("velocity range cross-layer parity (vA-B)", () => {
  it.each(TOKENS)(
    "%s yields identical velocity + deviation in both layers",
    (token) => {
      expect(viaTransform(token)).toStrictEqual(viaNotes(token));
    },
  );

  // The v0 lower-bound edge the parametric corpus can't cover: both grammars
  // reject it at parse time with a byte-identical targeted error (base velocity 0
  // is the delete sentinel, so the range would silently delete every note). The
  // single `min === 0` guard covers both orderings and the equal-bounds case.
  const V0_ERROR =
    /velocity ranges must start at 1 or higher — v0 is the delete sentinel/;

  it.each(["v0-100", "v100-0", "v0-0"])(
    "%s is rejected at parse time in BOTH layers (shared v0 delete sentinel)",
    (token) => {
      expect(() => interpretNotation(`${token} C3 1|1`)).toThrow(V0_ERROR);
      expect(() =>
        applyTransforms(
          [{ pitch: 60, start_time: 0, duration: 1, velocity: 100 }],
          token,
          4,
          4,
        ),
      ).toThrow(V0_ERROR);
    },
  );
});
