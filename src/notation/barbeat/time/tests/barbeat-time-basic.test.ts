// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.ts";
import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
} from "../barbeat-time.ts";

// Mock console.warn to capture out-of-range beat warnings
vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}));

describe("barbeat-time utilities", () => {
  describe("beatsToBarBeat", () => {
    it("converts basic beat positions to bar|beat format", () => {
      expect(beatsToBarBeat(0, 4)).toBe("1|1");
      expect(beatsToBarBeat(1, 4)).toBe("1|2");
      expect(beatsToBarBeat(3, 4)).toBe("1|4");
      expect(beatsToBarBeat(4, 4)).toBe("2|1");
      expect(beatsToBarBeat(7, 4)).toBe("2|4");
      expect(beatsToBarBeat(8, 4)).toBe("3|1");
    });

    it("handles floating point beats", () => {
      expect(beatsToBarBeat(0.5, 4)).toBe("1|1.5");
      expect(beatsToBarBeat(1.25, 4)).toBe("1|2.25");
      expect(beatsToBarBeat(3.75, 4)).toBe("1|4.75");
      expect(beatsToBarBeat(4.5, 4)).toBe("2|1.5");
    });

    it("formats beats without unnecessary decimals", () => {
      expect(beatsToBarBeat(1.0, 4)).toBe("1|2");
      expect(beatsToBarBeat(1.1, 4)).toBe("1|2.1");
      expect(beatsToBarBeat(1.25, 4)).toBe("1|2.25");
      expect(beatsToBarBeat(1.0, 4)).toBe("1|2");
    });

    it("works with different time signatures", () => {
      // 3/4 time (3 beats per bar)
      expect(beatsToBarBeat(0, 3)).toBe("1|1");
      expect(beatsToBarBeat(2, 3)).toBe("1|3");
      expect(beatsToBarBeat(3, 3)).toBe("2|1");
      expect(beatsToBarBeat(5, 3)).toBe("2|3");

      // 6/8 time (6 beats per bar)
      expect(beatsToBarBeat(0, 6)).toBe("1|1");
      expect(beatsToBarBeat(5, 6)).toBe("1|6");
      expect(beatsToBarBeat(6, 6)).toBe("2|1");
      expect(beatsToBarBeat(11, 6)).toBe("2|6");
    });

    it("handles precise floating point formatting", () => {
      expect(beatsToBarBeat(0.333, 4)).toBe("1|1.333");
      expect(beatsToBarBeat(0.666667, 4)).toBe("1|1.667");
      expect(beatsToBarBeat(1.123456, 4)).toBe("1|2.123");
    });
  });

  describe("barBeatToBeats", () => {
    it("converts basic bar|beat format to beats", () => {
      expect(barBeatToBeats("1|1", 4)).toBe(0);
      expect(barBeatToBeats("1|2", 4)).toBe(1);
      expect(barBeatToBeats("1|4", 4)).toBe(3);
      expect(barBeatToBeats("2|1", 4)).toBe(4);
      expect(barBeatToBeats("2|4", 4)).toBe(7);
      expect(barBeatToBeats("3|1", 4)).toBe(8);
    });

    it("handles floating point beats", () => {
      expect(barBeatToBeats("1|1.5", 4)).toBe(0.5);
      expect(barBeatToBeats("1|2.25", 4)).toBe(1.25);
      expect(barBeatToBeats("1|4.75", 4)).toBe(3.75);
      expect(barBeatToBeats("2|1.5", 4)).toBe(4.5);
    });

    it("works with different time signatures", () => {
      // 3/4 time
      expect(barBeatToBeats("1|1", 3)).toBe(0);
      expect(barBeatToBeats("1|3", 3)).toBe(2);
      expect(barBeatToBeats("2|1", 3)).toBe(3);
      expect(barBeatToBeats("2|3", 3)).toBe(5);

      // 6/8 time
      expect(barBeatToBeats("1|1", 6)).toBe(0);
      expect(barBeatToBeats("1|6", 6)).toBe(5);
      expect(barBeatToBeats("2|1", 6)).toBe(6);
      expect(barBeatToBeats("2|6", 6)).toBe(11);
    });

    it("allows beats to overflow the bar", () => {
      expect(barBeatToBeats("1|5", 4)).toBe(4);
      expect(barBeatToBeats("1|10", 4)).toBe(9);
      expect(barBeatToBeats("1|10.5", 4)).toBe(9.5);
      expect(barBeatToBeats("2|10.5", 4)).toBe(13.5);
      expect(barBeatToBeats("1|10.5", 3)).toBe(9.5);
      expect(barBeatToBeats("2|10.5", 3)).toBe(12.5);
    });

    describe("out-of-range beat warning", () => {
      beforeEach(() => {
        vi.mocked(console.warn).mockClear();
      });

      it("warns when a beat overflows past the next bar's downbeat", () => {
        barBeatToBeats("1|9", 4);

        expect(console.warn).toHaveBeenCalledWith(
          "Beat 9 exceeds the bar (beatsPerBar=4); it will land in a later bar — did you mean a higher bar number?",
        );
      });

      it("warns relative to the meter's beats per bar", () => {
        // beat 5 is fine in 4/4 but overflows in 3/4
        barBeatToBeats("1|5", 3);

        expect(console.warn).toHaveBeenCalledWith(
          "Beat 5 exceeds the bar (beatsPerBar=3); it will land in a later bar — did you mean a higher bar number?",
        );
      });

      it("does not warn for beats within the bar or on the next downbeat", () => {
        barBeatToBeats("1|4", 4); // within bar
        barBeatToBeats("1|4.5", 4); // sub-beat within bar
        barBeatToBeats("1|5", 4); // next bar's downbeat (beatsPerBar+1)

        expect(console.warn).not.toHaveBeenCalled();
      });
    });

    it("throws error for invalid format", () => {
      expect(() => barBeatToBeats("invalid", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats("1:", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats(":2", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats("1|2:3", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("a:b", 4)).toThrow("Invalid bar|beat format");
    });

    it("returns negative time for explicit positions before 1|1 (no throw)", () => {
      // Live accepts notes before the clip start, so a position that resolves
      // before 1|1 yields negative time instead of throwing.
      expect(barBeatToBeats("0|1", 4)).toBe(-4);
      expect(barBeatToBeats("-1|1", 4)).toBe(-8);
      expect(barBeatToBeats("1|0", 4)).toBe(-1);
      expect(barBeatToBeats("1|-1", 3)).toBe(-2);
    });

    it("handles ±n note-value offset and decimal beat notation", () => {
      // Eighth triplets in 4/4: +n/12 = +1/3 beat, +n/6 = +2/3 beat
      expect(barBeatToBeats("1|1+n/12", 4, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToBeats("1|1+n/6", 4, 4)).toBeCloseTo(2 / 3, 10);
      expect(barBeatToBeats("1|2+n/12", 4, 4)).toBeCloseTo(4 / 3, 10);

      // Dotted / dyadic positions as decimals
      expect(barBeatToBeats("1|1.5", 4)).toBe(0.5);
      expect(barBeatToBeats("2|2.5", 4)).toBe(5.5);

      // Quintuplet offsets: +n/20 = +1/5 beat, +n/10 = +2/5 beat
      expect(barBeatToBeats("1|1+n/20", 4, 4)).toBeCloseTo(0.2, 10);
      expect(barBeatToBeats("1|1+n/10", 4, 4)).toBeCloseTo(0.4, 10);
    });

    it("resolves ±n offsets meter-awarely (denominator-dependent)", () => {
      // The same n/12 offset displaces by a meter-dependent number of beats.
      // 4/4 (denom 4): n/12 = 1/3 beat
      expect(barBeatToBeats("1|1+n/12", 3, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToBeats("2|1+n/12", 3, 4)).toBeCloseTo(3 + 1 / 3, 10);
      // 6/8 (denom 8): n/12 = 2/3 beat (a real eighth triplet vs the eighth beat)
      expect(barBeatToBeats("1|1+n/12", 6, 8)).toBeCloseTo(2 / 3, 10);
      expect(barBeatToBeats("1|2+n/12", 6, 8)).toBeCloseTo(1 + 2 / 3, 10);
    });

    it("handles beats with + and - note-value offsets", () => {
      // Basic cases (4/4)
      expect(barBeatToBeats("1|2+n/12", 4, 4)).toBeCloseTo(4 / 3, 10);
      expect(barBeatToBeats("1|2+n3/16", 4, 4)).toBeCloseTo(1.75, 10);
      expect(barBeatToBeats("1|3+n/8", 4, 4)).toBeCloseTo(2.5, 10);

      // Different bars
      expect(barBeatToBeats("2|1+n/16", 4, 4)).toBeCloseTo(4.25, 10);
      expect(barBeatToBeats("3|2+n/6", 4, 4)).toBeCloseTo(8 + 5 / 3, 10);

      // Negative offset (push/pull behind the beat)
      expect(barBeatToBeats("1|3-n/12", 4, 4)).toBeCloseTo(1 + 2 / 3, 10);

      // Different time signature (6/8, denom 8)
      expect(barBeatToBeats("2|1+n/16", 6, 8)).toBeCloseTo(6.5, 10);
    });

    it("borrows across a bar line when a -n offset pulls before the downbeat", () => {
      // `2|1-n/12` = "just before the bar-2 downbeat": beat 1 − ⅓ = ⅔, which
      // borrows into bar 1 → absolute 3 + ⅔ in 4/4.
      expect(barBeatToBeats("2|1-n/12", 4, 4)).toBeCloseTo(3 + 2 / 3, 10);
      // The eighth triplet is meter-invariant: same ⅓-quarter displacement in
      // 6/8 (offset (1/12)*8 = ⅔ of an eighth beat), borrowing into bar 1.
      // bar 1 has 6 eighth beats → absolute (6 − ⅔) musical beats = 5 + ⅓.
      expect(barBeatToBeats("2|1-n/12", 6, 8)).toBeCloseTo(5 + 1 / 3, 10);
      // A larger offset can borrow more than one beat: `2|1-n/2` = bar 2 minus
      // a half note (2 beats) → bar 1 beat 3 → absolute 2.
      expect(barBeatToBeats("2|1-n/2", 4, 4)).toBeCloseTo(2, 10);
    });

    it("returns negative time when a -n offset reaches before 1|1 (no throw)", () => {
      // No bar to borrow from, so these resolve before the clip start. Allowed
      // (Live accepts notes at negative time) rather than rejected.
      expect(barBeatToBeats("1|1-n/4", 4, 4)).toBeCloseTo(-1, 10); // beat 0
      expect(barBeatToBeats("1|1-n/8", 4, 4)).toBeCloseTo(-0.5, 10); // beat 0.5
      expect(barBeatToBeats("1|1-n/12", 4, 4)).toBeCloseTo(-1 / 3, 10); // beat 2/3
    });

    it("rejects bare-fraction and mixed beat positions", () => {
      // Bare fractions and bar-relative mixed numbers are no longer accepted —
      // note values wear the n sigil.
      expect(() => barBeatToBeats("1|4/3", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1|2+1/3", 4)).toThrow(
        "Invalid bar|beat format",
      );
    });

    it("handles invalid offset formats", () => {
      expect(() => barBeatToBeats("1|/3", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1|4/", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1|1+n/3/2", 4)).toThrow(
        "Invalid bar|beat format",
      );
    });

    it("throws error for division by zero in an offset", () => {
      expect(() => barBeatToBeats("1|1+n1/0", 4, 4)).toThrow(
        "Invalid bar|beat format: division by zero",
      );
      expect(() => barBeatToBeats("1|1+n/0", 4, 4)).toThrow(
        "Invalid bar|beat format: division by zero",
      );
    });

    it("throws error for invalid numeric values (NaN)", () => {
      expect(() => barBeatToBeats("1|a", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats("1|a+n1/2", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1|2+na/2", 4)).toThrow(
        "Invalid bar|beat format",
      );
    });
  });

  describe("abletonBeatsToBarBeat", () => {
    it("converts Ableton beats to bar|beat in 4/4 time", () => {
      // In 4/4, 1 Ableton beat = 1 musical beat
      expect(abletonBeatsToBarBeat(0, 4, 4)).toBe("1|1");
      expect(abletonBeatsToBarBeat(1, 4, 4)).toBe("1|2");
      expect(abletonBeatsToBarBeat(3, 4, 4)).toBe("1|4");
      expect(abletonBeatsToBarBeat(4, 4, 4)).toBe("2|1");
      expect(abletonBeatsToBarBeat(7.5, 4, 4)).toBe("2|4.5");
    });

    it("converts Ableton beats to bar|beat in 3/4 time", () => {
      // In 3/4, 1 Ableton beat = 1 musical beat
      expect(abletonBeatsToBarBeat(0, 3, 4)).toBe("1|1");
      expect(abletonBeatsToBarBeat(1, 3, 4)).toBe("1|2");
      expect(abletonBeatsToBarBeat(2, 3, 4)).toBe("1|3");
      expect(abletonBeatsToBarBeat(3, 3, 4)).toBe("2|1");
      expect(abletonBeatsToBarBeat(4.5, 3, 4)).toBe("2|2.5");
    });

    it("converts Ableton beats to bar|beat in 6/8 time", () => {
      // In 6/8, 1 Ableton beat = 2 musical beats (8th notes)
      expect(abletonBeatsToBarBeat(0, 6, 8)).toBe("1|1");
      expect(abletonBeatsToBarBeat(0.5, 6, 8)).toBe("1|2");
      expect(abletonBeatsToBarBeat(1, 6, 8)).toBe("1|3");
      expect(abletonBeatsToBarBeat(1.5, 6, 8)).toBe("1|4");
      expect(abletonBeatsToBarBeat(2.5, 6, 8)).toBe("1|6");
      expect(abletonBeatsToBarBeat(3, 6, 8)).toBe("2|1");
    });

    it("converts Ableton beats to bar|beat in 2/2 time", () => {
      // In 2/2, 1 Ableton beat = 0.5 musical beats (half notes)
      expect(abletonBeatsToBarBeat(0, 2, 2)).toBe("1|1");
      expect(abletonBeatsToBarBeat(2, 2, 2)).toBe("1|2");
      expect(abletonBeatsToBarBeat(4, 2, 2)).toBe("2|1");
      expect(abletonBeatsToBarBeat(6, 2, 2)).toBe("2|2");
    });

    it("converts Ableton beats to bar|beat in 9/8 time", () => {
      // In 9/8, 1 Ableton beat = 2 musical beats (8th notes)
      expect(abletonBeatsToBarBeat(0, 9, 8)).toBe("1|1");
      expect(abletonBeatsToBarBeat(0.5, 9, 8)).toBe("1|2");
      expect(abletonBeatsToBarBeat(2, 9, 8)).toBe("1|5");
      expect(abletonBeatsToBarBeat(4, 9, 8)).toBe("1|9");
      expect(abletonBeatsToBarBeat(4.5, 9, 8)).toBe("2|1");
    });

    it("converts Ableton beats to bar|beat in 12/16 time", () => {
      // In 12/16, 1 Ableton beat = 4 musical beats (16th notes)
      expect(abletonBeatsToBarBeat(0, 12, 16)).toBe("1|1");
      expect(abletonBeatsToBarBeat(0.25, 12, 16)).toBe("1|2");
      expect(abletonBeatsToBarBeat(0.5, 12, 16)).toBe("1|3");
      expect(abletonBeatsToBarBeat(2.75, 12, 16)).toBe("1|12");
      expect(abletonBeatsToBarBeat(3, 12, 16)).toBe("2|1");
    });

    it("handles floating point Ableton beats", () => {
      expect(abletonBeatsToBarBeat(0.5, 4, 4)).toBe("1|1.5");
      expect(abletonBeatsToBarBeat(1.25, 4, 4)).toBe("1|2.25");
      expect(abletonBeatsToBarBeat(0.25, 6, 8)).toBe("1|1.5");
      expect(abletonBeatsToBarBeat(0.75, 6, 8)).toBe("1|2.5");
    });
  });

  describe("barBeatToAbletonBeats", () => {
    it("converts bar|beat to Ableton beats in 4/4 time", () => {
      expect(barBeatToAbletonBeats("1|1", 4, 4)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 4, 4)).toBe(1);
      expect(barBeatToAbletonBeats("1|4", 4, 4)).toBe(3);
      expect(barBeatToAbletonBeats("2|1", 4, 4)).toBe(4);
      expect(barBeatToAbletonBeats("2|4.5", 4, 4)).toBe(7.5);
    });

    it("converts bar|beat to Ableton beats in 3/4 time", () => {
      expect(barBeatToAbletonBeats("1|1", 3, 4)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 3, 4)).toBe(1);
      expect(barBeatToAbletonBeats("1|3", 3, 4)).toBe(2);
      expect(barBeatToAbletonBeats("2|1", 3, 4)).toBe(3);
      expect(barBeatToAbletonBeats("2|2.5", 3, 4)).toBe(4.5);
    });

    it("converts bar|beat to Ableton beats in 6/8 time", () => {
      expect(barBeatToAbletonBeats("1|1", 6, 8)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 6, 8)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|3", 6, 8)).toBe(1);
      expect(barBeatToAbletonBeats("1|4", 6, 8)).toBe(1.5);
      expect(barBeatToAbletonBeats("1|6", 6, 8)).toBe(2.5);
      expect(barBeatToAbletonBeats("2|1", 6, 8)).toBe(3);
    });

    it("converts bar|beat to Ableton beats in 2/2 time", () => {
      expect(barBeatToAbletonBeats("1|1", 2, 2)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 2, 2)).toBe(2);
      expect(barBeatToAbletonBeats("2|1", 2, 2)).toBe(4);
      expect(barBeatToAbletonBeats("2|2", 2, 2)).toBe(6);
    });

    it("converts bar|beat to Ableton beats in 9/8 time", () => {
      expect(barBeatToAbletonBeats("1|1", 9, 8)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 9, 8)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|5", 9, 8)).toBe(2);
      expect(barBeatToAbletonBeats("1|9", 9, 8)).toBe(4);
      expect(barBeatToAbletonBeats("2|1", 9, 8)).toBe(4.5);
    });

    it("converts bar|beat to Ableton beats in 12/16 time", () => {
      expect(barBeatToAbletonBeats("1|1", 12, 16)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 12, 16)).toBe(0.25);
      expect(barBeatToAbletonBeats("1|3", 12, 16)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|12", 12, 16)).toBe(2.75);
      expect(barBeatToAbletonBeats("2|1", 12, 16)).toBe(3);
    });

    it("handles floating point beats", () => {
      expect(barBeatToAbletonBeats("1|1.5", 4, 4)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|2.25", 4, 4)).toBe(1.25);
      expect(barBeatToAbletonBeats("1|1.5", 6, 8)).toBe(0.25);
      expect(barBeatToAbletonBeats("1|2.5", 6, 8)).toBe(0.75);
    });

    it("converts ±n offset bar|beat notation to Ableton beats", () => {
      // Eighth triplets in 4/4 (1 Ableton beat = 1 musical beat)
      expect(barBeatToAbletonBeats("1|1+n/12", 4, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToAbletonBeats("1|1+n/6", 4, 4)).toBeCloseTo(2 / 3, 10);
      expect(barBeatToAbletonBeats("1|2+n/12", 4, 4)).toBeCloseTo(4 / 3, 10);

      // Eighth triplets in 3/4
      expect(barBeatToAbletonBeats("1|1+n/12", 3, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToAbletonBeats("2|1+n/12", 3, 4)).toBeCloseTo(
        3 + 1 / 3,
        10,
      );

      // 6/8: n/12 is a real eighth triplet (1/3 of an Ableton beat) anchored to
      // the eighth-note beat, so beat 1 + n/12 = 1/3, beat 2 + n/12 = 5/6.
      expect(barBeatToAbletonBeats("1|1+n/12", 6, 8)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToAbletonBeats("1|2+n/12", 6, 8)).toBeCloseTo(5 / 6, 10);

      // Dotted / dyadic positions as decimals
      expect(barBeatToAbletonBeats("1|1.5", 4, 4)).toBe(0.5);
      expect(barBeatToAbletonBeats("2|2.5", 4, 4)).toBe(5.5);
    });
  });

  describe("round-trip conversions", () => {
    it("beatsToBarBeat and barBeatToBeats are inverses", () => {
      const testCases = [
        { beats: 0, beatsPerBar: 4 },
        { beats: 1.5, beatsPerBar: 4 },
        { beats: 7.25, beatsPerBar: 4 },
        { beats: 0, beatsPerBar: 3 },
        { beats: 2.333, beatsPerBar: 3 },
        { beats: 5.667, beatsPerBar: 6 },
      ];

      for (const { beats, beatsPerBar } of testCases) {
        const barBeat = beatsToBarBeat(beats, beatsPerBar);
        const backToBeats = barBeatToBeats(barBeat, beatsPerBar);

        expect(backToBeats).toBeCloseTo(beats, 10);
      }
    });

    it("note-value offset notation round-trips correctly", () => {
      // ±n offset inputs convert correctly (denominator defaults to 4)
      const testCases = [
        { barBeat: "1|1+n/12", beatsPerBar: 4, expectedBeats: 1 / 3 },
        { barBeat: "1|1+n/6", beatsPerBar: 4, expectedBeats: 2 / 3 },
        { barBeat: "1|2+n/12", beatsPerBar: 4, expectedBeats: 4 / 3 },
        { barBeat: "2|1+n/12", beatsPerBar: 3, expectedBeats: 3 + 1 / 3 },
        { barBeat: "1|1.5", beatsPerBar: 4, expectedBeats: 0.5 },
      ];

      for (const { barBeat, beatsPerBar, expectedBeats } of testCases) {
        const beats = barBeatToBeats(barBeat, beatsPerBar);

        expect(beats).toBeCloseTo(expectedBeats, 10);
      }
    });

    it("abletonBeatsToBarBeat and barBeatToAbletonBeats are inverses", () => {
      const testCases = [
        { abletonBeats: 0, num: 4, den: 4 },
        { abletonBeats: 1.5, num: 4, den: 4 },
        { abletonBeats: 7.25, num: 4, den: 4 },
        { abletonBeats: 0, num: 3, den: 4 },
        { abletonBeats: 2.5, num: 3, den: 4 },
        { abletonBeats: 1.75, num: 6, den: 8 },
        { abletonBeats: 4.5, num: 6, den: 8 },
        { abletonBeats: 2.25, num: 9, den: 8 },
        { abletonBeats: 6, num: 2, den: 2 },
        { abletonBeats: 1.75, num: 12, den: 16 },
      ];

      for (const { abletonBeats, num, den } of testCases) {
        const barBeat = abletonBeatsToBarBeat(abletonBeats, num, den);
        const backToAbletonBeats = barBeatToAbletonBeats(barBeat, num, den);

        expect(backToAbletonBeats).toBeCloseTo(abletonBeats, 10);
      }
    });
  });

  describe("edge cases and precision", () => {
    it("handles very small floating point values", () => {
      expect(beatsToBarBeat(0.001, 4)).toBe("1|1.001");
      expect(barBeatToBeats("1|1.001", 4)).toBeCloseTo(0.001, 5);
    });

    it("handles large beat values", () => {
      expect(beatsToBarBeat(1000, 4)).toBe("251|1");
      expect(barBeatToBeats("251|1", 4)).toBe(1000);
    });

    it("maintains precision through wrapper function conversions", () => {
      const originalAbletonBeats = 12.3456789;
      const barBeat = abletonBeatsToBarBeat(originalAbletonBeats, 4, 4);
      const finalAbletonBeats = barBeatToAbletonBeats(barBeat, 4, 4);

      expect(finalAbletonBeats).toBeCloseTo(originalAbletonBeats, 3);
    });

    it("handles complex time signatures with wrapper functions", () => {
      // 11/16 time
      expect(abletonBeatsToBarBeat(0, 11, 16)).toBe("1|1");
      expect(abletonBeatsToBarBeat(2.75, 11, 16)).toBe("2|1");
      expect(barBeatToAbletonBeats("2|1", 11, 16)).toBe(2.75);

      // 15/8 time
      expect(abletonBeatsToBarBeat(0, 15, 8)).toBe("1|1");
      expect(abletonBeatsToBarBeat(7.5, 15, 8)).toBe("2|1");
      expect(barBeatToAbletonBeats("2|1", 15, 8)).toBe(7.5);
    });
  });
});
