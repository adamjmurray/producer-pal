// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  abletonBeatsToBarBeatDuration,
  barBeatDurationToAbletonBeats,
  timeSigToAbletonBeatsPerBar,
} from "./barbeat-time.ts";

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

describe("abletonBeatsToBarBeatDuration", () => {
  describe("4/4 time signature", () => {
    it("converts zero duration", () => {
      expect(abletonBeatsToBarBeatDuration(0, 4, 4)).toBe("0:0");
    });

    it("converts beat-only durations", () => {
      expect(abletonBeatsToBarBeatDuration(1, 4, 4)).toBe("0:1");
      expect(abletonBeatsToBarBeatDuration(2, 4, 4)).toBe("0:2");
      expect(abletonBeatsToBarBeatDuration(3, 4, 4)).toBe("0:3");
    });

    it("converts exact bar durations", () => {
      expect(abletonBeatsToBarBeatDuration(4, 4, 4)).toBe("1:0");
      expect(abletonBeatsToBarBeatDuration(8, 4, 4)).toBe("2:0");
      expect(abletonBeatsToBarBeatDuration(12, 4, 4)).toBe("3:0");
    });

    it("converts bar + beat durations", () => {
      expect(abletonBeatsToBarBeatDuration(5, 4, 4)).toBe("1:1");
      expect(abletonBeatsToBarBeatDuration(6, 4, 4)).toBe("1:2");
      expect(abletonBeatsToBarBeatDuration(7, 4, 4)).toBe("1:3");
      expect(abletonBeatsToBarBeatDuration(9, 4, 4)).toBe("2:1");
    });

    it("handles fractional beats", () => {
      expect(abletonBeatsToBarBeatDuration(1.5, 4, 4)).toBe("0:1.5");
      expect(abletonBeatsToBarBeatDuration(2.25, 4, 4)).toBe("0:2.25");
      expect(abletonBeatsToBarBeatDuration(4.5, 4, 4)).toBe("1:0.5");
      expect(abletonBeatsToBarBeatDuration(5.75, 4, 4)).toBe("1:1.75");
    });
  });

  describe("6/8 time signature", () => {
    it("converts durations using eighth note musical beats", () => {
      // In 6/8: 6 eighth notes per bar = 3 quarter notes per bar
      expect(abletonBeatsToBarBeatDuration(0, 6, 8)).toBe("0:0");
      expect(abletonBeatsToBarBeatDuration(0.5, 6, 8)).toBe("0:1"); // 1 eighth note
      expect(abletonBeatsToBarBeatDuration(1, 6, 8)).toBe("0:2"); // 2 eighth notes
      expect(abletonBeatsToBarBeatDuration(1.5, 6, 8)).toBe("0:3"); // 3 eighth notes
      expect(abletonBeatsToBarBeatDuration(3, 6, 8)).toBe("1:0"); // 1 complete bar
      expect(abletonBeatsToBarBeatDuration(3.5, 6, 8)).toBe("1:1"); // 1 bar + 1 eighth note
      expect(abletonBeatsToBarBeatDuration(6, 6, 8)).toBe("2:0"); // 2 complete bars
    });
  });

  describe("2/2 time signature", () => {
    it("converts durations using half note musical beats", () => {
      // In 2/2: 2 half notes per bar = 4 quarter notes per bar
      expect(abletonBeatsToBarBeatDuration(0, 2, 2)).toBe("0:0");
      expect(abletonBeatsToBarBeatDuration(2, 2, 2)).toBe("0:1"); // 1 half note
      expect(abletonBeatsToBarBeatDuration(4, 2, 2)).toBe("1:0"); // 1 complete bar
      expect(abletonBeatsToBarBeatDuration(6, 2, 2)).toBe("1:1"); // 1 bar + 1 half note
      expect(abletonBeatsToBarBeatDuration(8, 2, 2)).toBe("2:0"); // 2 complete bars
    });

    it("handles fractional half notes", () => {
      expect(abletonBeatsToBarBeatDuration(1, 2, 2)).toBe("0:0.5"); // 0.5 half notes
      expect(abletonBeatsToBarBeatDuration(3, 2, 2)).toBe("0:1.5"); // 1.5 half notes
      expect(abletonBeatsToBarBeatDuration(5, 2, 2)).toBe("1:0.5"); // 1 bar + 0.5 half notes
    });
  });

  describe("3/4 time signature", () => {
    it("converts durations using quarter note musical beats", () => {
      expect(abletonBeatsToBarBeatDuration(0, 3, 4)).toBe("0:0");
      expect(abletonBeatsToBarBeatDuration(1, 3, 4)).toBe("0:1");
      expect(abletonBeatsToBarBeatDuration(2, 3, 4)).toBe("0:2");
      expect(abletonBeatsToBarBeatDuration(3, 3, 4)).toBe("1:0"); // 1 complete bar
      expect(abletonBeatsToBarBeatDuration(4, 3, 4)).toBe("1:1");
      expect(abletonBeatsToBarBeatDuration(6, 3, 4)).toBe("2:0"); // 2 complete bars
    });
  });

  it("throws error for negative durations", () => {
    expect(() => abletonBeatsToBarBeatDuration(-1, 4, 4)).toThrow(
      "Duration cannot be negative, got: -1",
    );
  });
});

describe("barBeatDurationToAbletonBeats", () => {
  describe("4/4 time signature", () => {
    it("converts zero duration", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 4, 4)).toBe(0);
    });

    it("converts beat-only durations", () => {
      expect(barBeatDurationToAbletonBeats("0:1", 4, 4)).toBe(1);
      expect(barBeatDurationToAbletonBeats("0:2", 4, 4)).toBe(2);
      expect(barBeatDurationToAbletonBeats("0:3", 4, 4)).toBe(3);
    });

    it("converts exact bar durations", () => {
      expect(barBeatDurationToAbletonBeats("1:0", 4, 4)).toBe(4);
      expect(barBeatDurationToAbletonBeats("2:0", 4, 4)).toBe(8);
      expect(barBeatDurationToAbletonBeats("3:0", 4, 4)).toBe(12);
    });

    it("converts bar + beat durations", () => {
      expect(barBeatDurationToAbletonBeats("1:1", 4, 4)).toBe(5);
      expect(barBeatDurationToAbletonBeats("1:2", 4, 4)).toBe(6);
      expect(barBeatDurationToAbletonBeats("1:3", 4, 4)).toBe(7);
      expect(barBeatDurationToAbletonBeats("2:1", 4, 4)).toBe(9);
    });

    it("handles fractional beats", () => {
      expect(barBeatDurationToAbletonBeats("0:1.5", 4, 4)).toBe(1.5);
      expect(barBeatDurationToAbletonBeats("0:2.25", 4, 4)).toBe(2.25);
      expect(barBeatDurationToAbletonBeats("1:0.5", 4, 4)).toBe(4.5);
      expect(barBeatDurationToAbletonBeats("1:1.75", 4, 4)).toBe(5.75);
    });
  });

  describe("6/8 time signature", () => {
    it("converts durations using eighth note musical beats", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 6, 8)).toBe(0);
      expect(barBeatDurationToAbletonBeats("0:1", 6, 8)).toBe(0.5); // 1 eighth note
      expect(barBeatDurationToAbletonBeats("0:2", 6, 8)).toBe(1); // 2 eighth notes
      expect(barBeatDurationToAbletonBeats("0:6", 6, 8)).toBe(3); // 6 eighth notes
      expect(barBeatDurationToAbletonBeats("1:0", 6, 8)).toBe(3); // 1 complete bar
      expect(barBeatDurationToAbletonBeats("1:1", 6, 8)).toBe(3.5); // 1 bar + 1 eighth note
      expect(barBeatDurationToAbletonBeats("2:0", 6, 8)).toBe(6); // 2 complete bars
    });
  });

  describe("2/2 time signature", () => {
    it("converts durations using half note musical beats", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 2, 2)).toBe(0);
      expect(barBeatDurationToAbletonBeats("0:1", 2, 2)).toBe(2); // 1 half note
      expect(barBeatDurationToAbletonBeats("1:0", 2, 2)).toBe(4); // 1 complete bar
      expect(barBeatDurationToAbletonBeats("1:1", 2, 2)).toBe(6); // 1 bar + 1 half note
      expect(barBeatDurationToAbletonBeats("2:0", 2, 2)).toBe(8); // 2 complete bars
    });

    it("handles fractional half notes", () => {
      expect(barBeatDurationToAbletonBeats("0:0.5", 2, 2)).toBe(1); // 0.5 half notes
      expect(barBeatDurationToAbletonBeats("0:1.5", 2, 2)).toBe(3); // 1.5 half notes
      expect(barBeatDurationToAbletonBeats("1:0.5", 2, 2)).toBe(5); // 1 bar + 0.5 half notes
    });
  });

  describe("3/4 time signature", () => {
    it("converts durations using quarter note musical beats", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 3, 4)).toBe(0);
      expect(barBeatDurationToAbletonBeats("0:1", 3, 4)).toBe(1);
      expect(barBeatDurationToAbletonBeats("0:2", 3, 4)).toBe(2);
      expect(barBeatDurationToAbletonBeats("1:0", 3, 4)).toBe(3); // 1 complete bar
      expect(barBeatDurationToAbletonBeats("1:1", 3, 4)).toBe(4);
      expect(barBeatDurationToAbletonBeats("2:0", 3, 4)).toBe(6); // 2 complete bars
    });
  });

  it("handles fractional beat notation", () => {
    // Triplet durations in 4/4
    expect(barBeatDurationToAbletonBeats("0:1/3", 4, 4)).toBeCloseTo(1 / 3, 10);
    expect(barBeatDurationToAbletonBeats("0:2/3", 4, 4)).toBeCloseTo(2 / 3, 10);
    expect(barBeatDurationToAbletonBeats("0:4/3", 4, 4)).toBeCloseTo(4 / 3, 10);

    // Bar + fractional beats
    expect(barBeatDurationToAbletonBeats("1:1/2", 4, 4)).toBe(4.5);
    expect(barBeatDurationToAbletonBeats("1:3/4", 4, 4)).toBe(4.75);
    expect(barBeatDurationToAbletonBeats("2:5/3", 4, 4)).toBeCloseTo(
      8 + 5 / 3,
      10,
    );

    // Quintuplet durations
    expect(barBeatDurationToAbletonBeats("0:1/5", 4, 4)).toBeCloseTo(0.2, 10);
    expect(barBeatDurationToAbletonBeats("0:2/5", 4, 4)).toBeCloseTo(0.4, 10);
  });

  it("handles fractional durations in different time signatures", () => {
    // Triplets in 3/4
    expect(barBeatDurationToAbletonBeats("0:1/3", 3, 4)).toBeCloseTo(1 / 3, 10);
    expect(barBeatDurationToAbletonBeats("1:2/3", 3, 4)).toBeCloseTo(
      3 + 2 / 3,
      10,
    );

    // Triplets in 6/8 (1 musical beat = 0.5 Ableton beats)
    expect(barBeatDurationToAbletonBeats("0:1/3", 6, 8)).toBeCloseTo(1 / 6, 10);
    expect(barBeatDurationToAbletonBeats("0:2/3", 6, 8)).toBeCloseTo(1 / 3, 10);
  });

  it("throws error for invalid format", () => {
    // Pipe symbol used instead of colon
    expect(() => barBeatDurationToAbletonBeats("1|2", 4, 4)).toThrow(
      'Use ":" for bar:beat format, not "|"',
    );
    // Invalid bar:beat formats (missing parts)
    expect(() => barBeatDurationToAbletonBeats("1:", 4, 4)).toThrow(
      "Invalid bar:beat duration format",
    );
    expect(() => barBeatDurationToAbletonBeats("0:/3", 4, 4)).toThrow(
      "Invalid bar:beat duration format",
    );
    expect(() => barBeatDurationToAbletonBeats("0:1/", 4, 4)).toThrow(
      "Invalid bar:beat duration format",
    );
  });

  it("accepts beat-only integer format (NEW)", () => {
    // "1" is now valid - it means 1 beat
    expect(barBeatDurationToAbletonBeats("1", 4, 4)).toBe(1);
    expect(barBeatDurationToAbletonBeats("2", 4, 4)).toBe(2);
    expect(barBeatDurationToAbletonBeats("0", 4, 4)).toBe(0);
  });

  it("throws error for negative values", () => {
    expect(() => barBeatDurationToAbletonBeats("-1:0", 4, 4)).toThrow(
      "Bars in duration must be 0 or greater, got: -1",
    );
    expect(() => barBeatDurationToAbletonBeats("0:-1", 4, 4)).toThrow(
      "Beats in duration must be 0 or greater, got: -1",
    );
    expect(() => barBeatDurationToAbletonBeats("0:-1/3", 4, 4)).toThrow(
      "Beats in duration must be 0 or greater",
    );
  });

  it("throws error for invalid integer+fraction format", () => {
    expect(() => barBeatDurationToAbletonBeats("abc+1/2", 4, 4)).toThrow(
      "Invalid duration format",
    );
    expect(() => barBeatDurationToAbletonBeats("1+1/0", 4, 4)).toThrow(
      "Invalid duration format: division by zero",
    );
    expect(() => barBeatDurationToAbletonBeats("1+a/2", 4, 4)).toThrow(
      "Invalid duration format",
    );
  });
});
