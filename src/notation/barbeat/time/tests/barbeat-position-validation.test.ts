// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { convertTimingParameters } from "#src/tools/clip/create/helpers/create-clip-helpers.ts";
import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "../barbeat-time.ts";

// Cross-surface parity: a STANDALONE bar|beat position field (create-clip
// start/firstStart/arrangementStart, locator time, playback loop start/end) must
// reject the same 1-indexing mistakes the `notes` grammar rejects, while letting
// everything the grammar accepts (including `-n` pickups) through. The low-level
// barBeatToAbletonBeats stays never-throw; only the new boundary validator
// throws. See ADR-0003.

// Positions the notes grammar rejects with its 1-indexing steer (badZeroBeat) or
// a zero/leading-zero bar. validateBarBeatPosition must throw a 1-indexing
// message for each, and the notes parser must throw for the same string.
const REJECTED_POSITIONS = [
  "1|0",
  "0|1",
  "1|01",
  "1|007",
  "0|0",
  "1|0.5",
  "1|-1",
];

// Positions the notes grammar accepts. validateBarBeatPosition must NOT throw,
// and the notes parser must parse the same string.
const ACCEPTED_POSITIONS = ["1|1", "2|3.5", "1|1-n/4", "4|4", "1|1.5", "10|2"];

describe("validateBarBeatPosition", () => {
  describe("rejects 0-indexed / zero-bar / leading-zero positions", () => {
    for (const pos of REJECTED_POSITIONS) {
      it(`throws the 1-indexing steer for "${pos}"`, () => {
        expect(() => validateBarBeatPosition(pos)).toThrow(/1-indexed/);
      });
    }

    it("uses the grammar's exact badZeroBeat wording for a zero beat", () => {
      expect(() => validateBarBeatPosition("1|0")).toThrow(
        "beats are 1-indexed: the downbeat is beat 1 (e.g. 1|1); for a pickup before it, offset from beat 1 (e.g. 1|1-n/4). Got beat 0.",
      );
      expect(() => validateBarBeatPosition("1|007")).toThrow("Got beat 007.");
    });

    it("names the offending bar for a zero/leading-zero bar", () => {
      expect(() => validateBarBeatPosition("0|1")).toThrow("Got bar 0.");
      expect(() => validateBarBeatPosition("01|1")).toThrow("Got bar 01.");
    });
  });

  describe("accepts valid positions (including pickups)", () => {
    for (const pos of ACCEPTED_POSITIONS) {
      it(`does not throw for "${pos}"`, () => {
        expect(() => validateBarBeatPosition(pos)).not.toThrow();
      });
    }

    it("leaves an unparseable/empty string to the conversion's own error", () => {
      // Callers guard `!= null`; the validator only owns the 1-indexing steer, so
      // it stays silent on shapes it does not recognize.
      expect(() => validateBarBeatPosition("")).not.toThrow();
      expect(() => validateBarBeatPosition("garbage")).not.toThrow();
    });
  });

  describe("parity with the notes grammar", () => {
    for (const pos of REJECTED_POSITIONS) {
      it(`notes parser also rejects "${pos} C3"`, () => {
        // A bad beat gets the grammar's 1-indexing steer; a zero/leading-zero
        // bar fails earlier, as a plain syntax error at the "|".
        expect(() => parser.parse(`${pos} C3`)).toThrow(
          /1-indexed|but "\|" found/,
        );
      });
    }

    for (const pos of ACCEPTED_POSITIONS) {
      it(`notes parser also accepts "${pos} C3"`, () => {
        expect(() => parser.parse(`${pos} C3`)).not.toThrow();
      });
    }
  });

  describe("low-level conversion stays never-throw (unchanged)", () => {
    it("barBeatToAbletonBeats still resolves 0-indexed positions to pre-origin beats", () => {
      // The hot-path conversion intentionally allows negative time (pickups); only
      // the standalone-field validator gates it. These values must not change.
      expect(barBeatToAbletonBeats("1|0", 4, 4)).toBe(-1);
      expect(barBeatToAbletonBeats("0|1", 4, 4)).toBe(-4);
      expect(barBeatToAbletonBeats("1|01", 4, 4)).toBe(0);
      expect(barBeatToAbletonBeats("1|007", 4, 4)).toBe(6);
    });

    it("a `-n` pickup resolves to negative time without throwing", () => {
      expect(() => validateBarBeatPosition("1|1-n/4")).not.toThrow();
      expect(barBeatToAbletonBeats("1|1-n/4", 4, 4)).toBe(-1);
    });
  });

  // Tool-level smoke: the create-clip timing converter (pure, no Live API) gates
  // each standalone position field through the validator.
  describe("create-clip convertTimingParameters rejects 0-indexed positions", () => {
    const convert = (
      arrangementStart: string | null,
      start: string | null,
      firstStart: string | null,
    ): void => {
      convertTimingParameters(
        arrangementStart,
        start,
        firstStart,
        null,
        true,
        4,
        4,
        4,
        4,
      );
    };

    it("rejects a 1|0 start", () => {
      expect(() => convert(null, "1|0", null)).toThrow(/1-indexed/);
    });

    it("rejects a 1|0 firstStart", () => {
      expect(() => convert(null, null, "1|0")).toThrow(/1-indexed/);
    });

    it("rejects a 0|1 arrangementStart", () => {
      expect(() => convert("0|1", null, null)).toThrow(/1-indexed/);
    });

    it("accepts a valid 2|3 start", () => {
      expect(() => convert(null, "2|3", null)).not.toThrow();
    });
  });
});
