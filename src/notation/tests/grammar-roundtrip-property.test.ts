// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Property-based round-trip + crash-resistance for the notation grammars.
//
// Two invariants no example-based test can pin by hand:
//
//   1. Serializer fixpoint. The read path (formatNotation) must emit notation the
//      interpreter (interpretNotation) reads back into the same notation —
//      reformatting is idempotent: format(interpret(format(notes))) ==
//      format(notes). We assert the STRING fixpoint rather than note equality so
//      the within-epsilon time merging the serializer documents (the 0.001-beat
//      grouping floor) is respected: it happens identically in both passes.
//
//   2. Crash resistance. interpretNotation and the transform parser are fed
//      arbitrary strings drawn from the notation-significant alphabet. They may
//      reject (a normal Error) or accept, but must never blow the stack
//      (RangeError) or hang — a malformed model emission is a bad request, not a
//      process killer.
//
// The RNG is a seeded mulberry32 so a failure reproduces from its seed; the suite
// is deterministic (no Math.random, which is unavailable in this project anyway).

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { parse as parseBarbeat } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { formatNotation } from "#src/notation/barbeat/serializer/barbeat-serializer.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { parse as parseTransform } from "#src/notation/transform/parser/transform-parser.ts";

// Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1).
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// Meters spanning /4, /8, /2 so the meter-aware time math is exercised.
const METERS: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [3, 4],
  [6, 8],
  [2, 2],
];

// Build a canonical note set: positive sixteenth-grid starts/durations,
// velocities 1-127 (no v0 — v0 is a deletion marker, not a round-trippable note),
// deduped by (pitch, start) so the source is already what the serializer would
// collapse it to. This keeps the fixpoint about grammar round-tripping, not about
// how the serializer merges genuine input collisions.
function randomNotes(rng: () => number): NoteEvent[] {
  const count = randomInt(rng, 1, 8);
  const byKey = new Map<string, NoteEvent>();

  for (let i = 0; i < count; i++) {
    const pitch = randomInt(rng, 0, 127);
    const start_time = randomInt(rng, 0, 64) * 0.25; // 0..16 beats on a 16th grid
    const key = `${pitch}@${start_time}`;

    byKey.set(key, {
      pitch,
      start_time,
      duration: randomInt(rng, 1, 16) * 0.25, // 0.25..4 beats, always > 0
      velocity: randomInt(rng, 1, 127),
    });
  }

  return [...byKey.values()];
}

// Alphabet of characters that mean something to one or both grammars, plus a few
// neutral ones, so fuzzed strings probe real lexer branches rather than landing
// on a single early reject.
const FUZZ_ALPHABET = "ABCDEFGabcdefg#b0123456789|+-/nNvtp@[],.: =()*";

function randomFuzzString(rng: () => number): string {
  const len = randomInt(rng, 0, 24);
  let out = "";

  for (let i = 0; i < len; i++) {
    out += FUZZ_ALPHABET[randomInt(rng, 0, FUZZ_ALPHABET.length - 1)];
  }

  return out;
}

// Did a thrown value indicate a crash (stack overflow) rather than a clean
// reject? A RangeError from "Maximum call stack size exceeded" is the failure we
// guard against; any other Error is an acceptable rejection.
function isCrash(error: unknown): boolean {
  return error instanceof RangeError;
}

describe("notation grammar round-trip + crash properties", () => {
  it("formatNotation→interpretNotation→formatNotation is idempotent over random clips", () => {
    const rng = mulberry32(0x1234_5678);
    let checked = 0;

    for (let seed = 0; seed < 600; seed++) {
      const [num, den] = METERS[seed % METERS.length] as readonly [
        number,
        number,
      ];
      // interpretNotation/formatNotation require numerator+denominator paired
      // (passing one alone throws); the numerator doubles as beatsPerBar.
      const options = { timeSigNumerator: num, timeSigDenominator: den };
      const notes = randomNotes(rng);

      const once = formatNotation(notes, options);
      const twice = formatNotation(interpretNotation(once, options), options);

      expect(twice, `fixpoint broke in ${num}/${den} for: ${once}`).toBe(once);
      checked++;
    }

    expect(checked).toBe(600);
  });

  it("interpretNotation never crashes on arbitrary input (rejects or parses)", () => {
    const rng = mulberry32(0x0bad_f00d);
    const crashed: string[] = [];

    for (let i = 0; i < 1500; i++) {
      const source = randomFuzzString(rng);

      // Collect the inputs that crash rather than asserting inside the catch, so
      // a failure reports every offender at once.
      crashed.push(...collectCrash(source, runInterpret));
    }

    expect(crashed).toStrictEqual([]);
  });

  it("the bar|beat parser never crashes on arbitrary input", () => {
    const rng = mulberry32(0x00c0_ffee);
    const crashed: string[] = [];

    for (let i = 0; i < 1500; i++) {
      const source = randomFuzzString(rng);

      crashed.push(...collectCrash(source, runBarbeatParse));
    }

    expect(crashed).toStrictEqual([]);
  });

  it("the transform parser never crashes on arbitrary input", () => {
    const rng = mulberry32(0xfeed_face);
    const crashed: string[] = [];

    for (let i = 0; i < 1500; i++) {
      const body = randomFuzzString(rng);
      // Frame the fuzz as both a range bound and an assignment RHS so both
      // sub-grammars are probed, not just the top-level rule.
      const sources = [body, `${body}: velocity = 1`, `1|1-2|1: ${body}`];

      for (const source of sources) {
        crashed.push(...collectCrash(source, runTransformParse));
      }
    }

    expect(crashed).toStrictEqual([]);
  });
});

const FUZZ_OPTS = { beatsPerBar: 4, timeSigDenominator: 4 };

function runInterpret(source: string): void {
  interpretNotation(source, { timeSigNumerator: 4, timeSigDenominator: 4 });
}

function runBarbeatParse(source: string): void {
  parseBarbeat(source, FUZZ_OPTS);
}

function runTransformParse(source: string): void {
  parseTransform(source, FUZZ_OPTS);
}

// Run `fn(source)`; return `[source]` if it crashed (stack overflow), else `[]`.
// A normal Error (a clean reject) is fine — only a RangeError counts as a crash.
function collectCrash(source: string, fn: (s: string) => void): string[] {
  try {
    fn(source);

    return [];
  } catch (error) {
    return isCrash(error) ? [source] : [];
  }
}
