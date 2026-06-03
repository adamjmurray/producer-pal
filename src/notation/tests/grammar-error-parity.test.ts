// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Cross-grammar ERROR-MESSAGE parity (L9).
//
// The bar|beat and transform grammars are compiled by independent Peggy passes
// that cannot share a rule, yet they parse the same position/offset/duration
// sub-languages. note-value-grammar-parity.test.ts proves they ACCEPT/REJECT the
// same tokens; this test proves that when they reject a SHARED malformed token
// they hand the user the SAME diagnostic — byte-for-byte. A model that gets a
// `1|0` steered one way from a clip notation string and a different way from a
// transform range bound would be needlessly confused; the two surfaces speak one
// error vocabulary.
//
// The contract is exact-string equality: if a future edit rewords one grammar's
// targeted error, this test fails until the other grammar is reworded to match,
// the same divergence-lock role note-value-grammar-parity plays for values.

import { describe, expect, it } from "vitest";
import { parse as parseBarbeat } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { parse as parseTransform } from "#src/notation/transform/parser/transform-parser.ts";

const OPTS = { beatsPerBar: 4, timeSigDenominator: 4 };

// Capture the thrown message from each grammar, or "" if it unexpectedly parsed.
function barbeatError(source: string): string {
  try {
    parseBarbeat(source, OPTS);

    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

function transformError(source: string): string {
  try {
    parseTransform(source, OPTS);

    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

// A malformed beat in a POSITION (bar|beat) is the same malformed beat in a
// transform RANGE BOUND. `posToken` is the `bar|beat` text fed straight into the
// bar|beat grammar (after a pitch) and into the transform grammar as the start of
// a `start-end: assignment` range. The captured `text()` aligns (each grammar
// reports just the beat portion), so the messages are identical.
const POSITION_CASES = [
  {
    name: "0-indexed beat (1|0)",
    posToken: "1|0",
    phrase: "beats are 1-indexed",
  },
  {
    name: "bare-fraction beat (1|4/3)",
    posToken: "1|4/3",
    phrase: "Got bare fraction",
  },
  {
    name: "bare mixed-number offset (1|1+1/3)",
    posToken: "1|1+1/3",
    phrase: "beat offsets use the note-value form",
  },
] as const;

// A malformed DURATION is shared between the bar|beat duration token and the
// transform `duration = ...` right-hand side.
const DURATION_CASES = [
  {
    name: "n-prefixed bar duration (n1bar)",
    durToken: "n1bar",
    phrase: 'bar durations don\'t use the "n" prefix',
  },
] as const;

describe("grammar error-message parity across surfaces (L9)", () => {
  describe("a malformed beat position reports the same error in both grammars", () => {
    for (const { name, posToken, phrase } of POSITION_CASES) {
      it(`${name} → identical message`, () => {
        const fromBarbeat = barbeatError(`C3 ${posToken}`);
        const fromTransform = transformError(`${posToken}-9|1: velocity = 1`);

        expect(fromBarbeat).toContain(phrase);
        expect(fromTransform).toContain(phrase);
        expect(fromTransform).toBe(fromBarbeat);
      });
    }
  });

  describe("a malformed duration reports the same error in both grammars", () => {
    for (const { name, durToken, phrase } of DURATION_CASES) {
      it(`${name} → identical message`, () => {
        const fromBarbeat = barbeatError(durToken);
        const fromTransform = transformError(`duration = ${durToken}`);

        expect(fromBarbeat).toContain(phrase);
        expect(fromTransform).toContain(phrase);
        expect(fromTransform).toBe(fromBarbeat);
      });
    }
  });

  describe("the fix the error suggests parses cleanly on both surfaces", () => {
    // Each steer names a valid replacement; guard that the replacement actually
    // parses, so the error can never point at a form the grammar also rejects.
    const VALID_POSITIONS = ["1|1", "1|1+n/12", "1|1.5"];

    for (const pos of VALID_POSITIONS) {
      it(`"${pos}" parses on both surfaces`, () => {
        expect(() => parseBarbeat(`C3 ${pos}`, OPTS)).not.toThrow();
        expect(() =>
          parseTransform(`${pos}-9|1: velocity = 1`, OPTS),
        ).not.toThrow();
      });
    }

    it('"1bar" duration parses on both surfaces', () => {
      expect(() => parseBarbeat("1bar", OPTS)).not.toThrow();
      expect(() => parseTransform("duration = 1bar", OPTS)).not.toThrow();
    });
  });
});
