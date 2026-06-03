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
// `lo == 0` cases (e.g. `v0-100`) are excluded from the parametric corpus for a
// mechanical reason, not a behavioral one: a velocity-0 base note is dropped by
// BOTH layers (v0 is the delete sentinel in each), so each yields an empty array
// with no surviving note[0] to read `.velocity`/`.deviation` from. The layers
// actually AGREE at v0 — a stronger parity than divergence — and that agreement
// is pinned by its own assertion below rather than the .each() corpus.

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

  // The v0 lower-bound edge the parametric corpus can't cover (empty result has
  // no note to compare): both layers treat a velocity-0 base as a delete, so the
  // note vanishes in each. Pin the agreement so it can't silently diverge.
  it("v0-N drops the note in BOTH layers (shared v0 delete sentinel)", () => {
    expect(interpretNotation("v0-100 C3 1|1")).toStrictEqual([]);

    const notes: NoteEvent[] = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
    ];

    applyTransforms(notes, "v0-100", 4, 4);
    expect(notes).toStrictEqual([]);
  });
});
