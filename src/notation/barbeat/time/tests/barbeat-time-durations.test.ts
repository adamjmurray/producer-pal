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
      expect(abletonBeatsToDuration(1, 4, 4)).toBe("1/4"); // quarter note
      expect(abletonBeatsToDuration(2, 4, 4)).toBe("1/2"); // half note
      expect(abletonBeatsToDuration(3, 4, 4)).toBe("3/4"); // dotted half
      expect(abletonBeatsToDuration(0.5, 4, 4)).toBe("1/8"); // eighth
      expect(abletonBeatsToDuration(0.25, 4, 4)).toBe("1/16"); // sixteenth
      expect(abletonBeatsToDuration(1.5, 4, 4)).toBe("3/8"); // dotted quarter
    });

    it("emits Nbar+N/D for mixed durations", () => {
      expect(abletonBeatsToDuration(5, 4, 4)).toBe("1bar+1/4");
      expect(abletonBeatsToDuration(6, 4, 4)).toBe("1bar+1/2");
      expect(abletonBeatsToDuration(7, 4, 4)).toBe("1bar+3/4");
      expect(abletonBeatsToDuration(9, 4, 4)).toBe("2bar+1/4");
      expect(abletonBeatsToDuration(4.5, 4, 4)).toBe("1bar+1/8");
    });
  });

  describe("6/8 time signature (3 quarters per bar)", () => {
    it("handles bar-aligned values using meter-aware bar size", () => {
      expect(abletonBeatsToDuration(0, 6, 8)).toBe("0bar");
      expect(abletonBeatsToDuration(3, 6, 8)).toBe("1bar");
      expect(abletonBeatsToDuration(6, 6, 8)).toBe("2bar");
    });

    it("handles sub-bar and mixed values", () => {
      expect(abletonBeatsToDuration(0.5, 6, 8)).toBe("1/8");
      expect(abletonBeatsToDuration(1, 6, 8)).toBe("1/4");
      expect(abletonBeatsToDuration(1.5, 6, 8)).toBe("3/8");
      expect(abletonBeatsToDuration(3.5, 6, 8)).toBe("1bar+1/8");
    });
  });

  describe("2/2 time signature (4 quarters per bar)", () => {
    it("handles bar-aligned values", () => {
      expect(abletonBeatsToDuration(4, 2, 2)).toBe("1bar");
      expect(abletonBeatsToDuration(8, 2, 2)).toBe("2bar");
    });

    it("handles sub-bar values", () => {
      expect(abletonBeatsToDuration(2, 2, 2)).toBe("1/2");
      expect(abletonBeatsToDuration(1, 2, 2)).toBe("1/4");
    });
  });

  describe("3/4 time signature (3 quarters per bar)", () => {
    it("handles bar-aligned values", () => {
      expect(abletonBeatsToDuration(3, 3, 4)).toBe("1bar");
      expect(abletonBeatsToDuration(6, 3, 4)).toBe("2bar");
    });

    it("handles sub-bar values and mixed durations", () => {
      expect(abletonBeatsToDuration(1, 3, 4)).toBe("1/4");
      expect(abletonBeatsToDuration(2, 3, 4)).toBe("1/2");
      expect(abletonBeatsToDuration(4, 3, 4)).toBe("1bar+1/4");
    });
  });

  it("emits triplet fractions when needed", () => {
    expect(abletonBeatsToDuration(1 / 3, 4, 4)).toBe("1/12"); // eighth triplet
    expect(abletonBeatsToDuration(2 / 3, 4, 4)).toBe("1/6"); // quarter triplet
    expect(abletonBeatsToDuration(4 / 3, 4, 4)).toBe("1/3"); // half triplet
  });

  it("throws error for negative durations", () => {
    expect(() => abletonBeatsToDuration(-1, 4, 4)).toThrow(
      "Duration cannot be negative, got: -1",
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
  });

  describe("N/D fraction form (whole-note based)", () => {
    it("parses standard binary fractions", () => {
      expect(durationToAbletonBeats("1/4", 4, 4)).toBe(1); // quarter
      expect(durationToAbletonBeats("1/8", 4, 4)).toBe(0.5); // eighth
      expect(durationToAbletonBeats("1/16", 4, 4)).toBe(0.25); // sixteenth
      expect(durationToAbletonBeats("1/2", 4, 4)).toBe(2); // half
      expect(durationToAbletonBeats("3/4", 4, 4)).toBe(3); // dotted half
      expect(durationToAbletonBeats("3/8", 4, 4)).toBe(1.5); // dotted quarter
    });

    it("parses triplet fractions", () => {
      expect(durationToAbletonBeats("1/12", 4, 4)).toBeCloseTo(1 / 3, 10);
      expect(durationToAbletonBeats("1/6", 4, 4)).toBeCloseTo(2 / 3, 10);
      expect(durationToAbletonBeats("1/3", 4, 4)).toBeCloseTo(4 / 3, 10);
    });

    it("treats empty numerator as 1", () => {
      expect(durationToAbletonBeats("/4", 4, 4)).toBe(1);
      expect(durationToAbletonBeats("/8", 4, 4)).toBe(0.5);
      expect(durationToAbletonBeats("/12", 4, 4)).toBeCloseTo(1 / 3, 10);
    });

    it("is meter-agnostic (fractions are absolute)", () => {
      expect(durationToAbletonBeats("1/4", 6, 8)).toBe(1);
      expect(durationToAbletonBeats("1/4", 2, 2)).toBe(1);
      expect(durationToAbletonBeats("1/8", 3, 4)).toBe(0.5);
    });
  });

  describe("Nbar+N/D mixed form", () => {
    it("parses mixed durations", () => {
      expect(durationToAbletonBeats("1bar+1/4", 4, 4)).toBe(5);
      expect(durationToAbletonBeats("1bar+1/8", 4, 4)).toBe(4.5);
      expect(durationToAbletonBeats("2bar+3/4", 4, 4)).toBe(11);
    });

    it("treats empty numerator as 1 in mixed form", () => {
      expect(durationToAbletonBeats("1bar+/4", 4, 4)).toBe(5);
      expect(durationToAbletonBeats("2bar+/8", 4, 4)).toBe(8.5);
    });

    it("respects meter for the bar component only", () => {
      expect(durationToAbletonBeats("1bar+1/4", 6, 8)).toBe(4); // 3 + 1
      expect(durationToAbletonBeats("1bar+1/8", 3, 4)).toBe(3.5); // 3 + 0.5
    });
  });

  it("throws on bare integers/decimals (no silent-magnitude rule)", () => {
    expect(() => durationToAbletonBeats("4", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("1.5", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => durationToAbletonBeats("0", 4, 4)).toThrow(
      "Invalid duration format",
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
    expect(() => durationToAbletonBeats("1bars", 4, 4)).toThrow(
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
});
