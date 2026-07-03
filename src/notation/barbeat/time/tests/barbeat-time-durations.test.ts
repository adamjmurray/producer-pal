// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  abletonBeatsToDuration,
  durationToAbletonBeats,
  timeSigToAbletonBeatsPerBar,
} from "../barbeat-time.ts";

describe("timeSigToAbletonBeatsPerBar", () => {
  it("converts time signatures to Ableton beats per bar", () => {
    expect(timeSigToAbletonBeatsPerBar(4, 4)).toBe(4); // 4/4 = 4 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(3, 4)).toBe(3); // 3/4 = 3 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(6, 8)).toBe(3); // 6/8 = 3 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(2, 2)).toBe(4); // 2/2 = 4 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(9, 8)).toBe(4.5); // 9/8 = 4.5 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(12, 16)).toBe(3); // 12/16 = 3 quarter notes per bar
  });
});

describe("abletonBeatsToDuration", () => {
  describe("4/4 time signature", () => {
    it("emits 0bar for zero duration", () => {
      expect(abletonBeatsToDuration(0, 4, 4)).toBe("0bar");
    });

    it("emits bar-only for whole-bar multiples", () => {
      expect(abletonBeatsToDuration(4, 4, 4)).toBe("1bar");
      expect(abletonBeatsToDuration(8, 4, 4)).toBe("2bar");
      expect(abletonBeatsToDuration(12, 4, 4)).toBe("3bar");
    });

    it("emits whole-note fractions for sub-bar values", () => {
      expect(abletonBeatsToDuration(1, 4, 4)).toBe("n/4"); // quarter note
      expect(abletonBeatsToDuration(2, 4, 4)).toBe("n/2"); // half note
      expect(abletonBeatsToDuration(3, 4, 4)).toBe("n/2d"); // dotted half (sugared, was n3/4)
      expect(abletonBeatsToDuration(0.5, 4, 4)).toBe("n/8"); // eighth
      expect(abletonBeatsToDuration(0.25, 4, 4)).toBe("n/16"); // sixteenth
      expect(abletonBeatsToDuration(1.5, 4, 4)).toBe("n/4d"); // dotted quarter (sugared, was n3/8)
    });

    it("emits Nbar+n<fraction> for mixed durations", () => {
      expect(abletonBeatsToDuration(5, 4, 4)).toBe("1bar+n/4");
      expect(abletonBeatsToDuration(6, 4, 4)).toBe("1bar+n/2");
      expect(abletonBeatsToDuration(7, 4, 4)).toBe("1bar+n/2d"); // dotted half (sugared, was 1bar+n3/4)
      expect(abletonBeatsToDuration(9, 4, 4)).toBe("2bar+n/4");
      expect(abletonBeatsToDuration(4.5, 4, 4)).toBe("1bar+n/8");
    });
  });

  describe("6/8 time signature (3 quarters per bar)", () => {
    it("handles bar-aligned values using meter-aware bar size", () => {
      expect(abletonBeatsToDuration(0, 6, 8)).toBe("0bar");
      expect(abletonBeatsToDuration(3, 6, 8)).toBe("1bar");
      expect(abletonBeatsToDuration(6, 6, 8)).toBe("2bar");
    });

    it("handles sub-bar and mixed values", () => {
      expect(abletonBeatsToDuration(0.5, 6, 8)).toBe("n/8");
      expect(abletonBeatsToDuration(1, 6, 8)).toBe("n/4");
      expect(abletonBeatsToDuration(1.5, 6, 8)).toBe("n/4d"); // dotted quarter (sugared, was n3/8)
      expect(abletonBeatsToDuration(3.5, 6, 8)).toBe("1bar+n/8");
    });
  });

  describe("2/2 time signature (4 quarters per bar)", () => {
    it("handles bar-aligned values", () => {
      expect(abletonBeatsToDuration(4, 2, 2)).toBe("1bar");
      expect(abletonBeatsToDuration(8, 2, 2)).toBe("2bar");
    });

    it("handles sub-bar values", () => {
      expect(abletonBeatsToDuration(2, 2, 2)).toBe("n/2");
      expect(abletonBeatsToDuration(1, 2, 2)).toBe("n/4");
    });
  });

  describe("3/4 time signature (3 quarters per bar)", () => {
    it("handles bar-aligned values", () => {
      expect(abletonBeatsToDuration(3, 3, 4)).toBe("1bar");
      expect(abletonBeatsToDuration(6, 3, 4)).toBe("2bar");
    });

    it("handles sub-bar values and mixed durations", () => {
      expect(abletonBeatsToDuration(1, 3, 4)).toBe("n/4");
      expect(abletonBeatsToDuration(2, 3, 4)).toBe("n/2");
      expect(abletonBeatsToDuration(4, 3, 4)).toBe("1bar+n/4");
    });
  });

  it("emits triplet suffixes when needed", () => {
    // Triplet read-back sugar (power-of-two base): eighth triplet reads back n/8t
    // rather than the equivalent n/12. See formatModifiedNoteValue.
    expect(abletonBeatsToDuration(1 / 3, 4, 4)).toBe("n/8t"); // eighth triplet (was n/12)
    expect(abletonBeatsToDuration(2 / 3, 4, 4)).toBe("n/4t"); // quarter triplet (was n/6)
    expect(abletonBeatsToDuration(4 / 3, 4, 4)).toBe("n/2t"); // half triplet (was n/3)
  });

  describe("off-grid (sample-derived) lengths", () => {
    it("emits n<beats>/4 instead of throwing for sub-bar non-grid values", () => {
      // Sample-derived length that is no clean note-value fraction (the
      // regression: this used to throw). The off-grid escape wears the
      // `n` sigil with a `/4` denominator, so the numerator reads as the beat
      // count.
      expect(abletonBeatsToDuration(1.963754995004995, 4, 4)).toBe("n1.9638/4");
      expect(abletonBeatsToDuration(0.123456, 4, 4)).toBe("n0.1235/4");
    });

    it("emits the whole value as n<beats>/4 when the off-grid part spans bars", () => {
      // bars present, but the remainder is off-grid → no Nbar+<note-value>
      // form exists, so the entire value is emitted as one n<beats>/4 escape.
      expect(abletonBeatsToDuration(5.987654, 4, 4)).toBe("n5.9877/4");
    });

    it("strips trailing zeros from the off-grid numerator", () => {
      // Off-grid by 0.00001 (just past the note-value tolerance) → n<beats>/4,
      // then toFixed(4) "1.2500" has its trailing zeros stripped to "1.25".
      expect(abletonBeatsToDuration(1.25001, 4, 4)).toBe("n1.25/4");
    });

    it("never throws for arbitrary positive lengths", () => {
      for (const beats of [0.001, 1.111, 7.777, 13.3137]) {
        expect(() => abletonBeatsToDuration(beats, 4, 4)).not.toThrow();
      }
    });
  });

  it("clamps negative durations to 0 and warns instead of throwing", () => {
    expect(abletonBeatsToDuration(-1, 4, 4)).toBe("0bar");
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("duration cannot be negative, got -1"),
    );
  });
});

describe("durationToAbletonBeats", () => {
  describe("Nbar form", () => {
    it("parses bar-only durations in 4/4", () => {
      expect(durationToAbletonBeats("0bar", 4, 4)).toBe(0);
      expect(durationToAbletonBeats("1bar", 4, 4)).toBe(4);
      expect(durationToAbletonBeats("2bar", 4, 4)).toBe(8);
      expect(durationToAbletonBeats("4bar", 4, 4)).toBe(16);
    });

    it("is meter-aware", () => {
      expect(durationToAbletonBeats("1bar", 6, 8)).toBe(3); // 6 eighths = 3 quarters
      expect(durationToAbletonBeats("1bar", 3, 4)).toBe(3);
      expect(durationToAbletonBeats("1bar", 2, 2)).toBe(4);
      expect(durationToAbletonBeats("2bar", 6, 8)).toBe(6);
    });

    it("accepts the plural `bars` tolerance alias", () => {
      // Models may pluralize (`2bars`). Accepted as an alias, identical to `2bar`.
      expect(durationToAbletonBeats("1bars", 4, 4)).toBe(4);
      expect(durationToAbletonBeats("2bars", 4, 4)).toBe(8);
      expect(durationToAbletonBeats("1bars+n/4", 4, 4)).toBe(5);
      expect(durationToAbletonBeats("2bars", 6, 8)).toBe(6);
    });
  });

  describe("n<fraction> form (whole-note based)", () => {
    it("parses standard binary fractions", () => {
      expect(durationToAbletonBeats("n1/4", 4, 4)).toBe(1); // quarter
      expect(durationToAbletonBeats("n1/8", 4, 4)).toBe(0.5); // eighth
      expect(durationToAbletonBeats("n1/16", 4, 4)).toBe(0.25); // sixteenth
      expect(durationToAbletonBeats("n1/2", 4, 4)).toBe(2); // half
      expect(durationToAbletonBeats("n3/4", 4, 4)).toBe(3); // dotted half
      expect(durationToAbletonBeats("n3/8", 4, 4)).toBe(1.5); // dotted quarter
    });

    it("parses triplet fractions", () => {
      expect(durationToAbletonBeats("n1/12", 4, 4)).toBeCloseTo(1 / 3, 10);
      expect(durationToAbletonBeats("n1/6", 4, 4)).toBeCloseTo(2 / 3, 10);
      expect(durationToAbletonBeats("n1/3", 4, 4)).toBeCloseTo(4 / 3, 10);
    });

    it("treats empty numerator as 1", () => {
      expect(durationToAbletonBeats("n/4", 4, 4)).toBe(1);
      expect(durationToAbletonBeats("n/8", 4, 4)).toBe(0.5);
      expect(durationToAbletonBeats("n/12", 4, 4)).toBeCloseTo(1 / 3, 10);
    });

    it("is meter-agnostic (fractions are absolute)", () => {
      expect(durationToAbletonBeats("n1/4", 6, 8)).toBe(1);
      expect(durationToAbletonBeats("n1/4", 2, 2)).toBe(1);
      expect(durationToAbletonBeats("n1/8", 3, 4)).toBe(0.5);
    });
  });

  describe("n<decimal>/<int> off-grid escape form", () => {
    it("accepts a decimal numerator (n<beats>/4 == <beats> Ableton beats)", () => {
      expect(durationToAbletonBeats("n1.9638/4", 4, 4)).toBeCloseTo(1.9638, 6);
      expect(durationToAbletonBeats("n5.9877/4", 4, 4)).toBeCloseTo(5.9877, 6);
      expect(durationToAbletonBeats("n0.1235/4", 4, 4)).toBeCloseTo(0.1235, 6);
    });

    it("is meter-independent (the escape is absolute beats)", () => {
      expect(durationToAbletonBeats("n1.5/4", 6, 8)).toBeCloseTo(1.5, 6);
      expect(durationToAbletonBeats("n1.5/4", 3, 4)).toBeCloseTo(1.5, 6);
    });

    it("accepts a decimal numerator over any denominator", () => {
      // n<x>/d = (x/d) whole notes = (x/d)*4 quarters.
      expect(durationToAbletonBeats("n1.5/8", 4, 4)).toBeCloseTo(0.75, 6);
    });

    it("accepts a decimal numerator in the Nbar+n tail", () => {
      expect(durationToAbletonBeats("1bar+n0.5/4", 4, 4)).toBeCloseTo(4.5, 6);
    });
  });

  describe("Nbar+n<fraction> mixed form", () => {
    it("parses mixed durations", () => {
      expect(durationToAbletonBeats("1bar+n1/4", 4, 4)).toBe(5);
      expect(durationToAbletonBeats("1bar+n1/8", 4, 4)).toBe(4.5);
      expect(durationToAbletonBeats("2bar+n3/4", 4, 4)).toBe(11);
    });

    it("treats empty numerator as 1 in mixed form", () => {
      expect(durationToAbletonBeats("1bar+n/4", 4, 4)).toBe(5);
      expect(durationToAbletonBeats("2bar+n/8", 4, 4)).toBe(8.5);
    });

    it("respects meter for the bar component only", () => {
      expect(durationToAbletonBeats("1bar+n1/4", 6, 8)).toBe(4); // 3 + 1
      expect(durationToAbletonBeats("1bar+n1/8", 3, 4)).toBe(3.5); // 3 + 0.5
    });
  });

  it("rejects bare fractions (n prefix required for note values)", () => {
    expect(() => durationToAbletonBeats("1/4", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("/4", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1bar+1/4", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1bar+/4", 4, 4)).toThrow(
      "Invalid duration format",
    );
  });

  it("rejects bare numbers (a duration is never a bare scalar)", () => {
    // The serializer emits the n<beats>/4 escape for off-grid lengths, so bare
    // numbers are no longer a round-trip form — they are rejected on input,
    // matching the authoring grammar. Off-grid values must use n<beats>/4.
    expect(() => durationToAbletonBeats("4", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1.5", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("0", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1.9638", 4, 4)).toThrow(
      "Invalid duration format",
    );
  });

  it("rejects n-prefixed bar forms with a targeted Nbar steer", () => {
    // Convergent model hallucination (`n1bar` to fill a bar): the `n` sigil is
    // only for denominator-bearing note values, bars are the bare `Nbar` form.
    for (const bad of ["n1bar", "n/1bar", "n3/4bar"]) {
      expect(() => durationToAbletonBeats(bad, 4, 4)).toThrow(
        /bar durations don't use the "n" prefix/,
      );
    }

    expect(() => durationToAbletonBeats("n2bar", 4, 4)).toThrow(
      /write Nbar \(e\.g\. 2bar\)/,
    );
  });

  it("throws on bar:beat duration glyph (retired)", () => {
    expect(() => durationToAbletonBeats("1:0", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("0:2", 4, 4)).toThrow(
      "Invalid duration format",
    );
  });

  it("throws on bar|beat position glyph", () => {
    expect(() => durationToAbletonBeats("1|1", 4, 4)).toThrow(
      "Invalid duration format",
    );
  });

  it("throws on malformed inputs", () => {
    expect(() => durationToAbletonBeats("", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("bar", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1 bar", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1bar+", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1bar+1", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1/", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1bar+1/", 4, 4)).toThrow(
      "Invalid duration format",
    );
  });
});

describe("duration round-trip consistency", () => {
  const testCases = [
    {
      timeSig: [4, 4],
      abletonBeats: [0, 1, 2, 3, 4, 5, 8, 12, 1.5, 2.25, 4.5, 7.75],
    },
    {
      timeSig: [6, 8],
      abletonBeats: [0, 0.5, 1, 1.5, 3, 3.5, 6, 9, 0.25, 1.75, 2.5],
    },
    { timeSig: [2, 2], abletonBeats: [0, 2, 4, 6, 8, 1, 3, 5, 7] },
    { timeSig: [3, 4], abletonBeats: [0, 1, 2, 3, 4, 6, 9, 1.5, 2.5] },
  ];

  for (const { timeSig, abletonBeats } of testCases) {
    describe(`${timeSig[0]}/${timeSig[1]} time signature`, () => {
      for (const beats of abletonBeats) {
        it(`round-trip consistency for ${beats} Ableton beats`, () => {
          const duration = abletonBeatsToDuration(
            beats,
            timeSig[0] as number,
            timeSig[1] as number,
          );
          const converted = durationToAbletonBeats(
            duration,
            timeSig[0] as number,
            timeSig[1] as number,
          );

          expect(converted).toBeCloseTo(beats, 10);
        });
      }
    });
  }

  it("off-grid lengths round-trip approximately via the n<beats>/4 escape", () => {
    const beats = 1.963754995004995;
    const str = abletonBeatsToDuration(beats, 4, 4);

    expect(str).toBe("n1.9638/4");
    expect(durationToAbletonBeats(str, 4, 4)).toBeCloseTo(beats, 3);
  });
});
