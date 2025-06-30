// src/notation/barbeat/barbeat-parse-notation.test.js
import { describe, expect, it } from "vitest";
import { parseNotation } from "./barbeat-parse-notation";

describe("bar|beat parseNotation()", () => {
  it("returns empty array for empty input", () => {
    expect(parseNotation("")).toEqual([]);
    expect(parseNotation(null)).toEqual([]);
    expect(parseNotation(undefined)).toEqual([]);
  });

  it("parses simple notes with defaults", () => {
    const result = parseNotation("C3 D3 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles time state changes", () => {
    const result = parseNotation("1|1 C3 1|2 D3 2|1 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 1, beat 1
      {
        pitch: 62,
        start_time: 1,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 1, beat 2
      {
        pitch: 64,
        start_time: 4,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 2, beat 1 (4 beats per bar)
    ]);
  });

  it("handles velocity state changes", () => {
    const result = parseNotation("v80 C3 v120 D3 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 120,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 120,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles velocity range state changes", () => {
    const result = parseNotation("v80-120 C3 v60-100 D3 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 40,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 60,
        probability: 1.0,
        velocity_deviation: 40,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 60,
        probability: 1.0,
        velocity_deviation: 40,
      },
    ]);
  });

  it("handles mixed velocity and velocity range", () => {
    const result = parseNotation("v100 C3 v80-120 D3 v90 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 40,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 90,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles probability state changes", () => {
    const result = parseNotation("p0.8 C3 p0.5 D3 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 0.8,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 0.5,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 0.5,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles duration state changes", () => {
    const result = parseNotation("t0.5 C3 t2.0 D3 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 2.0,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 2.0,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles sub-beat timing", () => {
    const result = parseNotation("1|1.5 C3 1|2.25 D3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0.5,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // beat 1.5 = 0.5 beats from start
      {
        pitch: 62,
        start_time: 1.25,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // beat 2.25 = 1.25 beats from start
    ]);
  });

  it("handles complex state combinations", () => {
    const result = parseNotation(
      "1|1 v100 t0.25 p0.9 C3 D3 1|2 v80-120 t1.0 p0.7 E3 F3",
    );
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 0.25,
        velocity: 100,
        probability: 0.9,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 0.25,
        velocity: 100,
        probability: 0.9,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 1,
        duration: 1.0,
        velocity: 80,
        probability: 0.7,
        velocity_deviation: 40,
      },
      {
        pitch: 65,
        start_time: 1,
        duration: 1.0,
        velocity: 80,
        probability: 0.7,
        velocity_deviation: 40,
      },
    ]);
  });

  it("handles drum pattern example with probability and velocity range", () => {
    const result = parseNotation(`
      1|1 v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1
      1|1.5 p0.6 Gb1  
      1|2 v90 p1.0 D1
      v100 p0.9 Gb1
    `);
    expect(result).toEqual([
      {
        pitch: 36,
        start_time: 0,
        duration: 0.25,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // C1 (kick)
      {
        pitch: 42,
        start_time: 0,
        duration: 0.25,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 20,
      }, // Gb1 (hihat)
      {
        pitch: 42,
        start_time: 0.5,
        duration: 0.25,
        velocity: 80,
        probability: 0.6,
        velocity_deviation: 20,
      }, // Gb1 (hihat)
      {
        pitch: 38,
        start_time: 1,
        duration: 0.25,
        velocity: 90,
        probability: 1.0,
        velocity_deviation: 0,
      }, // D1 (snare)
      {
        pitch: 42,
        start_time: 1,
        duration: 0.25,
        velocity: 100,
        probability: 0.9,
        velocity_deviation: 0,
      }, // Gb1 (hihat)
    ]);
  });

  it("supports different time signatures via the beatsPerBar option (legacy)", () => {
    const result = parseNotation("1|1 C3 2|1 D3", { beatsPerBar: 3 });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 1, beat 1
      {
        pitch: 62,
        start_time: 3,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 2, beat 1 (3 beats per bar)
    ]);
  });

  it("supports different time signatures via timeSigNumerator/timeSigDenominator", () => {
    const result = parseNotation("1|1 C3 2|1 D3", {
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 1, beat 1
      {
        pitch: 62,
        start_time: 3,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // bar 2, beat 1 (3 beats per bar)
    ]);
  });

  it("converts time signatures with half-note denominators correctly", () => {
    // 2/2 time: 1 musical beat (half note) = 2 Ableton beats (quarter notes)
    const result = parseNotation("1|1 C3 1|2 D3", {
      timeSigNumerator: 2,
      timeSigDenominator: 2,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 2,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 2,
        duration: 2,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // beat 2 in 2/2 = 2 Ableton beats
    ]);
  });

  it("prefers timeSigNumerator/timeSigDenominator over beatsPerBar", () => {
    const result = parseNotation("1|1 C3 2|1 D3", {
      beatsPerBar: 4,
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 3,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // Uses 3 beats per bar, not 4
    ]);
  });

  it("converts time signatures with different denominators correctly", () => {
    // 6/8 time: 1 Ableton beat = 2 musical beats
    const result = parseNotation("1|1 C3 1|3 D3", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 1,
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // beat 3 in 6/8 = 1 Ableton beat
    ]);
  });

  it("throws error when only timeSigNumerator is provided", () => {
    expect(() => parseNotation("C3", { timeSigNumerator: 4 })).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("throws error when only timeSigDenominator is provided", () => {
    expect(() => parseNotation("C3", { timeSigDenominator: 4 })).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("maintains state across multiple bar boundaries", () => {
    const result = parseNotation("1|1 v80 t0.5 p0.8 C3 3|2 D3 5|1 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 0.5,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 0,
      }, // bar 1, beat 1
      {
        pitch: 62,
        start_time: 9,
        duration: 0.5,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 0,
      }, // bar 3, beat 2 = (3-1)*4 + (2-1) = 9
      {
        pitch: 64,
        start_time: 16,
        duration: 0.5,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 0,
      }, // bar 5, beat 1 = (5-1)*4 + (1-1) = 16
    ]);
  });

  it("handles velocity range validation", () => {
    expect(() => parseNotation("v128-130 C3")).toThrow(
      "Invalid velocity range 128-130",
    );
    expect(() => parseNotation("v-1-100 C3")).toThrow();
  });

  it("handles probability range validation", () => {
    expect(() => parseNotation("p1.5 C3")).toThrow(
      "Note probability 1.5 outside valid range 0.0-1.0",
    );
  });

  it("handles pitch range validation", () => {
    expect(() => parseNotation("C-3")).toThrow(/outside valid range/);
    expect(() => parseNotation("C9")).toThrow(/outside valid range/);
  });

  it("provides helpful error messages for syntax errors", () => {
    expect(() => parseNotation("invalid syntax")).toThrow(
      /bar|beat syntax error.*at position/,
    );
  });

  it("handles mixed order of state changes", () => {
    const result = parseNotation("t0.5 1|1 v80 p0.7 C3 v100 2|1 t1.0 p1.0 D3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 0.5,
        velocity: 80,
        probability: 0.7,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 4,
        duration: 1.0,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles enharmonic equivalents", () => {
    const result = parseNotation("C#3 Db3 F#3 Gb3");
    expect(result).toEqual([
      {
        pitch: 61,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // C#3
      {
        pitch: 61,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // Db3 (same as C#3)
      {
        pitch: 66,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // F#3
      {
        pitch: 66,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      }, // Gb3 (same as F#3)
    ]);
  });

  it("preserves notes with velocity 0 for deletion logic", () => {
    const result = parseNotation("1|1 v100 C3 v0 D3 v80 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 0,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("preserves notes with velocity range starting at 0", () => {
    const result = parseNotation("1|1 v0-50 C3 v50-100 D3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 0,
        probability: 1.0,
        velocity_deviation: 50,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 50,
        probability: 1.0,
        velocity_deviation: 50,
      },
    ]);
  });

  it("preserves all v0 notes for deletion logic", () => {
    const result = parseNotation("1|1 v0 C3 D3 E3");
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 0,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 0,
        probability: 1.0,
        velocity_deviation: 0,
      },
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 0,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });
});
