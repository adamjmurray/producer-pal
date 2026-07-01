// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Cross-grammar parity for the pitch-class sub-grammar.
//
// The `pitchClass` rule is implemented independently in both Peggy grammars
// (barbeat-grammar.peggy and transform-grammar.peggy) because Peggy compiles
// each grammar separately and cannot import a shared rule. They MUST accept the
// same note names and compute the same MIDI value. This test feeds one corpus
// through both sites and asserts they agree — the single lock that keeps the
// two copies from silently diverging.
//
// It pins the forgiving-parser tolerances added together:
//   - case-insensitive note letters (`c3`, `gb1`, and the all-caps `GB1` where
//     an uppercase `B` stands in for a flat);
//   - the Unicode accidental glyphs ♯ (U+266F) / ♭ (U+266D);
//   - enharmonic spellings, including the two that wrap an octave: B# resolves
//     up to the next octave's C and Cb down to the previous octave's B, which
//     the shared `(octave+2)*12+value` formula carries on its own.
//
// Out-of-range pitches are deliberately EXCLUDED: the two grammars diverge there
// by design (barbeat emits the out-of-range value and the interpreter
// skips+warns; the transform grammar throws at parse time), so the corpus stays
// within 0-127 where both sites return a value.

import { describe, expect, it } from "vitest";
import { parse as parseBarbeat } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { parse as parseTransform } from "#src/notation/transform/parser/transform-parser.ts";

function pitchViaBarbeat(token: string): number {
  const els = parseBarbeat(token, { beatsPerBar: 4, timeSigDenominator: 4 });
  const el = els[0];

  if (els.length !== 1 || el?.pitch == null) {
    throw new Error(`barbeat did not parse "${token}" as a single pitch`);
  }

  return el.pitch;
}

function pitchViaTransform(token: string): number {
  const assigns = parseTransform(`${token}: velocity = 0`, { beatsPerBar: 4 });
  const pitchRange = assigns[0]?.pitchRange;

  if (pitchRange == null) {
    throw new Error(`transform did not parse "${token}" as a pitch selector`);
  }

  // A single pitch selector has startPitch === endPitch.
  return pitchRange.startPitch;
}

const PITCH_SITES = [
  { name: "barbeat pitchClass rule", fn: pitchViaBarbeat },
  { name: "transform pitchClass rule", fn: pitchViaTransform },
] as const;

describe("pitch-class grammar parity across both grammars", () => {
  describe("the same note name yields the same MIDI value on both sites", () => {
    // [token, expectedMidi]. MIDI = (octave + 2) * 12 + pitchClassValue.
    const TOKENS: ReadonlyArray<readonly [string, number]> = [
      // Plain canonical spellings (control).
      ["C3", 60],
      ["Gb3", 66],
      ["A#2", 58],
      // Case-insensitive.
      ["c3", 60],
      ["gb1", 42],
      ["GB1", 42], // all-caps: uppercase B is the flat
      ["eb3", 63],
      ["a#2", 58],
      // Unicode accidentals.
      ["C♯1", 37],
      ["D♭1", 37],
      ["c♯1", 37],
      // Enharmonic spellings, including the octave-wrapping edges.
      ["E#3", 65], // → F3, same octave
      ["Fb3", 64], // → E3, same octave
      ["B#3", 72], // → C4, wraps up an octave
      ["Cb4", 71], // → B3, wraps down an octave
      ["e#3", 65],
      ["cb4", 71],
    ];

    for (const [token, expected] of TOKENS) {
      it(`"${token}" → ${expected} on every site`, () => {
        for (const site of PITCH_SITES) {
          expect(site.fn(token)).toBe(expected);
        }
      });
    }
  });

  describe("both grammars reject the same malformed pitch names", () => {
    // No such letter, a double accidental, and an accidental with no octave —
    // all stay rejected on both sites (tolerance widens, it does not collapse).
    for (const token of ["H3", "Cbb3", "C##3", "c#"]) {
      it(`"${token}" is rejected on every site`, () => {
        for (const site of PITCH_SITES) {
          expect(() => site.fn(token)).toThrow();
        }
      });
    }
  });
});
