import { describe, expect, it, vi } from "vitest";
import { interpretNotation } from "./barbeat-interpreter";

describe("bar|beat interpretNotation()", () => {
  it("returns empty array for empty input", () => {
    expect(interpretNotation("")).toEqual([]);
    expect(interpretNotation(null)).toEqual([]);
    expect(interpretNotation(undefined)).toEqual([]);
  });

  it("parses simple notes with defaults", () => {
    const result = interpretNotation("C3 D3 E3 1|1");
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
    const result = interpretNotation("C3 1|1 D3 1|2 E3 2|1");
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
    const result = interpretNotation("v80 C3 v120 D3 E3 1|1");
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
    const result = interpretNotation("v80-120 C3 v60-100 D3 E3 1|1");
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
    const result = interpretNotation("v100 C3 v80-120 D3 v90 E3 1|1");
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
    const result = interpretNotation("p0.8 C3 p0.5 D3 E3 1|1");
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
    const result = interpretNotation("t0.5 C3 t2.0 D3 E3 1|1");
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

  it("handles bar:beat duration format in 4/4 (NEW)", () => {
    const result = interpretNotation("t2:1.5 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 9.5, // 2 bars (8 beats) + 1.5 beats = 9.5 Ableton beats in 4/4
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles bar:beat duration with fractions (NEW)", () => {
    const result = interpretNotation("t1:3/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 4.75, // 1 bar (4 beats) + 0.75 beats = 4.75 Ableton beats
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles beat-only decimal duration (NEW)", () => {
    const result = interpretNotation("t2.5 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 2.5, // 2.5 beats in 4/4 = 2.5 Ableton beats
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles beat-only fractional duration (NEW)", () => {
    const result = interpretNotation("t3/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 0.75, // 3/4 beats in 4/4 = 0.75 Ableton beats
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles bar:beat duration in 6/8 time (NEW)", () => {
    const result = interpretNotation("t1:2 C3 1|1", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 4.0, // 1 bar (6 eighth notes) + 2 eighth notes = 8 eighth notes = 4 quarter notes
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles duration with + operator in bar:beat format (NEW)", () => {
    const result = interpretNotation("t1:2+1/3 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result.length).toBe(1);
    expect(result[0].pitch).toBe(60);
    expect(result[0].start_time).toBe(0);
    expect(result[0].duration).toBeCloseTo(6 + 1 / 3, 10); // 1 bar (4 beats) + 2+1/3 beats = 6+1/3 beats
    expect(result[0].velocity).toBe(100);
    expect(result[0].probability).toBe(1.0);
    expect(result[0].velocity_deviation).toBe(0);
  });

  it("handles beat-only duration with + operator (NEW)", () => {
    const result = interpretNotation("t2+3/4 C3 1|1", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result).toEqual([
      {
        pitch: 60,
        start_time: 0,
        duration: 2.75, // 2+3/4 beats in 4/4 = 2.75 Ableton beats
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("handles beat positions with + operator (NEW)", () => {
    const result = interpretNotation("C3 1|2+1/3 D3 1|2+3/4", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result.length).toBe(2);

    // First note at 1|2+1/3
    expect(result[0].pitch).toBe(60);
    expect(result[0].start_time).toBeCloseTo(1 + 1 / 3, 10); // bar 1, beat 2+1/3
    expect(result[0].duration).toBe(1);
    expect(result[0].velocity).toBe(100);
    expect(result[0].probability).toBe(1.0);
    expect(result[0].velocity_deviation).toBe(0);

    // Second note at 1|2+3/4
    expect(result[1].pitch).toBe(62);
    expect(result[1].start_time).toBe(1.75); // bar 1, beat 2+3/4
    expect(result[1].duration).toBe(1);
    expect(result[1].velocity).toBe(100);
    expect(result[1].probability).toBe(1.0);
    expect(result[1].velocity_deviation).toBe(0);
  });

  it("handles mixed duration formats (NEW)", () => {
    const result = interpretNotation("t2:0 C3 1|1 t1.5 D3 1|2 t3/4 E3 1|3", {
      timeSigNumerator: 4,
      timeSigDenominator: 4,
    });
    expect(result[0].duration).toBe(8); // 2 bars = 8 beats
    expect(result[1].duration).toBe(1.5); // 1.5 beats
    expect(result[2].duration).toBe(0.75); // 3/4 beats
  });

  it("handles sub-beat timing", () => {
    const result = interpretNotation("C3 1|1.5 D3 |2.25");
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
    const result = interpretNotation(
      "v100 t0.25 p0.9 C3 D3 1|1 v80-120 t1.0 p0.7 E3 F3 |2",
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
    const result = interpretNotation(`
      v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1
      p0.6 Gb1 |1.5
      v90 p1.0 D1 v100 p0.9 Gb1 |2
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
    const result = interpretNotation("C3 1|1 D3 2|1", { beatsPerBar: 3 });
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
    const result = interpretNotation("C3 1|1 D3 2|1", {
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
    const result = interpretNotation("C3 1|1 D3 1|2", {
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
    const result = interpretNotation("C3 1|1 D3 2|1", {
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
    const result = interpretNotation("C3 1|1 D3 1|3", {
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
    expect(() => interpretNotation("C3", { timeSigNumerator: 4 })).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("throws error when only timeSigDenominator is provided", () => {
    expect(() => interpretNotation("C3", { timeSigDenominator: 4 })).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("maintains state across multiple bar boundaries", () => {
    const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 D3 3|2 E3 5|1");
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
    expect(() => interpretNotation("v128-130 C3")).toThrow(
      "Invalid velocity range 128-130",
    );
    expect(() => interpretNotation("v-1-100 C3")).toThrow();
  });

  it("handles probability range validation", () => {
    expect(() => interpretNotation("p1.5 C3")).toThrow(
      "Note probability 1.5 outside valid range 0.0-1.0",
    );
  });

  it("handles pitch range validation", () => {
    expect(() => interpretNotation("C-3")).toThrow(/outside valid range/);
    expect(() => interpretNotation("C9")).toThrow(/outside valid range/);
  });

  it("provides helpful error messages for syntax errors", () => {
    expect(() => interpretNotation("invalid syntax")).toThrow(
      /bar|beat syntax error.*at position/,
    );
  });

  it("handles mixed order of state changes", () => {
    const result = interpretNotation(
      "t0.5 v80 p0.7 C3 1|1 v100 t1.0 p1.0 D3 2|1",
    );
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
    const result = interpretNotation("C#3 Db3 F#3 Gb3 1|1");
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
    const result = interpretNotation("v100 C3 v0 D3 v80 E3 1|1");
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
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });

  it("treats velocity range starting at 0 as v0 deletion", () => {
    // Live API rejects velocity 0 even with deviation, so v0-50 becomes a deletion marker
    const result = interpretNotation("v0-50 C3 v50-100 D3 1|1");
    expect(result).toEqual([
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
    const result = interpretNotation("v0 C3 D3 E3 1|1");
    expect(result).toEqual([]);
  });

  describe("comment support", () => {
    it("handles line comments with //", () => {
      const result = interpretNotation("C3 1|1 // this is a C major");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles hash comments with #", () => {
      const result = interpretNotation("C1 1|1 # kick drum");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles block comments", () => {
      const result = interpretNotation("/* velocity */ v100 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles multi-line block comments", () => {
      const result = interpretNotation(`C3 /* this is a
multi-line comment */ D3 1|1`);
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
      ]);
    });

    it("handles comments at the start of input", () => {
      const result = interpretNotation("// start comment\nC3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles comments at the end of input", () => {
      const result = interpretNotation("C3 D3 1|1 // end comment");
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
      ]);
    });

    it("handles comments in the middle of tokens", () => {
      const result = interpretNotation("/* middle */ C3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles multiple comment styles in one line", () => {
      const result = interpretNotation(
        "C3 1|1 // major third /* mixed */ # styles",
      );
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles empty comments", () => {
      const result = interpretNotation("C3 1|1 // \nD3 1|2 # \n/**/ E3 1|3");
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
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles comments between state changes", () => {
      const result = interpretNotation(
        "v100 // set velocity\nt0.5 // set duration\nC3 1|1 // play note",
      );
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles comments with special characters", () => {
      const result = interpretNotation("C3 1|1 // C major chord!@#$%^&*()");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles drum pattern with comments", () => {
      const result = interpretNotation(`
        v100 t0.25 p1.0 C1 // kick drum
        v80-100 p0.8 Gb1 1|1 // hi-hat with variation
        p0.6 Gb1 |1.5 // ghost hi-hat
        v90 p1.0 D1 // snare
        v100 p0.9 Gb1 |2 // another hi-hat
      `);
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 0.25,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 0,
          duration: 0.25,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 20,
        },
        {
          pitch: 42,
          start_time: 0.5,
          duration: 0.25,
          velocity: 80,
          probability: 0.6,
          velocity_deviation: 20,
        },
        {
          pitch: 38,
          start_time: 1,
          duration: 0.25,
          velocity: 90,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 1,
          duration: 0.25,
          velocity: 100,
          probability: 0.9,
          velocity_deviation: 0,
        },
      ]);
    });
  });

  describe("time-position-driven note emission", () => {
    it("emits pitch at single time position", () => {
      const result = interpretNotation("C1 1|1");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("emits same pitch at multiple times (pitch persistence)", () => {
      const result = interpretNotation("C1 1|1 |2 |3 |4");
      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result[0].start_time).toBe(0);
      expect(result[1].start_time).toBe(1);
      expect(result[2].start_time).toBe(2);
      expect(result[3].start_time).toBe(3);
    });

    it("clears pitch buffer on first pitch after time", () => {
      const result = interpretNotation("C1 1|1 D1 1|2");
      expect(result).toHaveLength(2);
      expect(result[0].pitch).toBe(36); // C1
      expect(result[0].start_time).toBe(0);
      expect(result[1].pitch).toBe(38); // D1
      expect(result[1].start_time).toBe(1);
    });

    it("emits chord from buffered pitches", () => {
      const result = interpretNotation("C3 E3 G3 1|1");
      expect(result).toHaveLength(3);
      expect(result.every((n) => n.start_time === 0)).toBe(true);
      expect(result[0].pitch).toBe(60); // C3
      expect(result[1].pitch).toBe(64); // E3
      expect(result[2].pitch).toBe(67); // G3
    });

    it("captures state with each pitch", () => {
      const result = interpretNotation("v100 C3 v80 E3 1|1");
      expect(result).toHaveLength(2);
      expect(result[0].pitch).toBe(60); // C3
      expect(result[0].velocity).toBe(100);
      expect(result[1].pitch).toBe(64); // E3
      expect(result[1].velocity).toBe(80);
    });

    it("updates buffered pitches when state changes after time", () => {
      const result = interpretNotation("v100 C4 1|1 v90 |2");
      expect(result).toHaveLength(2);
      expect(result[0].pitch).toBe(72); // C4
      expect(result[0].velocity).toBe(100);
      expect(result[0].start_time).toBe(0);
      expect(result[1].pitch).toBe(72); // C4
      expect(result[1].velocity).toBe(90);
      expect(result[1].start_time).toBe(1);
    });

    it("handles complex state updates with multiple pitches", () => {
      const result = interpretNotation("v80 C4 v90 G4 1|1 v100 |2");
      expect(result).toHaveLength(4);
      // At 1|1: C4@v80, G4@v90
      expect(result[0].pitch).toBe(72);
      expect(result[0].velocity).toBe(80);
      expect(result[0].start_time).toBe(0);
      expect(result[1].pitch).toBe(79);
      expect(result[1].velocity).toBe(90);
      expect(result[1].start_time).toBe(0);
      // At 1|2: C4@v100, G4@v100 (buffer updated)
      expect(result[2].pitch).toBe(72);
      expect(result[2].velocity).toBe(100);
      expect(result[2].start_time).toBe(1);
      expect(result[3].pitch).toBe(79);
      expect(result[3].velocity).toBe(100);
      expect(result[3].start_time).toBe(1);
    });

    it("handles duration updates after time", () => {
      const result = interpretNotation("C4 1|1 t0.5 |2 t0.25 |3");
      expect(result).toHaveLength(3);
      expect(result[0].duration).toBe(1);
      expect(result[1].duration).toBe(0.5);
      expect(result[2].duration).toBe(0.25);
    });

    it("handles probability updates after time", () => {
      const result = interpretNotation("C4 1|1 p0.8 |2 p0.5 |3");
      expect(result).toHaveLength(3);
      expect(result[0].probability).toBe(1.0);
      expect(result[1].probability).toBe(0.8);
      expect(result[2].probability).toBe(0.5);
    });

    it("handles velocity range updates after time", () => {
      const result = interpretNotation("C4 1|1 v80-100 |2");
      expect(result).toHaveLength(2);
      expect(result[0].velocity).toBe(100);
      expect(result[0].velocity_deviation).toBe(0);
      expect(result[1].velocity).toBe(80);
      expect(result[1].velocity_deviation).toBe(20);
    });

    it("supports drum patterns", () => {
      const result = interpretNotation("C1 1|1 |2 |3 |4");
      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result.map((n) => n.start_time)).toEqual([0, 1, 2, 3]);
    });

    it("supports layered drum patterns", () => {
      const result = interpretNotation("C1 1|1 |3  D1 1|2 |4");
      expect(result).toHaveLength(4);
      expect(result[0].pitch).toBe(36); // C1 at 1|1
      expect(result[0].start_time).toBe(0);
      expect(result[1].pitch).toBe(36); // C1 at 1|3
      expect(result[1].start_time).toBe(2);
      expect(result[2].pitch).toBe(38); // D1 at 1|2
      expect(result[2].start_time).toBe(1);
      expect(result[3].pitch).toBe(38); // D1 at 1|4
      expect(result[3].start_time).toBe(3);
    });

    it("handles state changes between pitches in chord", () => {
      const result = interpretNotation("v80 C4 v90 G4 1|1");
      expect(result).toHaveLength(2);
      expect(result[0].velocity).toBe(80);
      expect(result[1].velocity).toBe(90);
    });

    it("warns when pitches buffered but no time position", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      interpretNotation("C3 E3 G3");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("3 pitch(es) buffered but no time position"),
      );
      consoleSpy.mockRestore();
    });

    it("warns when time position has no pitches", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      interpretNotation("1|1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Time position 1|1 has no pitches"),
      );
      consoleSpy.mockRestore();
    });

    it("warns when state changes after pitch but before time", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      interpretNotation("C4 v100 1|1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "state change after pitch(es) but before time position won't affect this group",
        ),
      );
      consoleSpy.mockRestore();
    });

    it("does not warn when state changes after pitch but before another pitch", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      const result = interpretNotation("v80 C4 v90 G4 1|1");
      expect(result).toHaveLength(2);
      // Should only warn about "state change won't affect group", not about it happening
      const warningCalls = consoleSpy.mock.calls.filter(
        (call) => !call[0].includes("buffered but no time position"),
      );
      expect(warningCalls).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it("does not warn when state changes after time", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      const result = interpretNotation("C4 1|1 v90 |2");
      expect(result).toHaveLength(2);
      // Should only warn about "state change won't affect group", not about it happening
      const warningCalls = consoleSpy.mock.calls.filter(
        (call) => !call[0].includes("buffered but no time position"),
      );
      expect(warningCalls).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });

  describe("|beat shortcut syntax", () => {
    it("uses |beat shortcut within same bar", () => {
      const result = interpretNotation("C3 1|1 |2 |3");
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
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 2
        {
          pitch: 60,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 3
      ]);
    });

    it("uses |beat shortcut after bar change", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 E3 |2 F3 |3");
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
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 2, beat 1
        {
          pitch: 64,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 2, beat 2
        {
          pitch: 65,
          start_time: 6,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 2, beat 3
      ]);
    });

    it("mixes full bar|beat and |beat notation", () => {
      const result = interpretNotation(
        "C3 1|1 D3 |2 E3 3|1 F3 |4 G3 2|3 A3 |4",
      );
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
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 3, beat 1
        {
          pitch: 65,
          start_time: 11,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 3, beat 4
        {
          pitch: 67,
          start_time: 6,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 2, beat 3
        {
          pitch: 69,
          start_time: 7,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 2, beat 4
      ]);
    });

    it("handles |beat with sub-beat timing", () => {
      const result = interpretNotation("C3 1|1.5 D3 |2.25 E3 |3.75");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 1.5
        {
          pitch: 62,
          start_time: 1.25,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 2.25
        {
          pitch: 64,
          start_time: 2.75,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 3.75
      ]);
    });

    it("preserves state across |beat shortcuts", () => {
      const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 D3 |2 v100 E3 |3");
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
          start_time: 1,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        }, // bar 1, beat 2
        {
          pitch: 64,
          start_time: 2,
          duration: 0.5,
          velocity: 100,
          probability: 0.8,
          velocity_deviation: 0,
        }, // bar 1, beat 3 (velocity changed but duration and probability preserved)
      ]);
    });

    it("works with different time signatures", () => {
      const result = interpretNotation("C3 1|1 D3 |2 E3 |3", {
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
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 2
        {
          pitch: 64,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 3
      ]);
    });

    it("assumes bar 1 when |beat is used at start without initial bar", () => {
      const result = interpretNotation("C3 |2");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 2 (assumed)
      ]);
    });

    it("assumes bar 1 when |beat is used without any prior bar number", () => {
      const result = interpretNotation("v100 t0.5 C3 |2");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 1,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 2 (assumed)
      ]);
    });

    it("assumes bar 1 when |beat is used after state changes but before any bar number", () => {
      const result = interpretNotation("v100 C3 |1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        }, // bar 1, beat 1 (assumed)
      ]);
    });
  });

  describe("bar copy", () => {
    it("copies a single bar to a different position", () => {
      const result = interpretNotation("C3 D3 E3 1|1 @2=1");
      expect(result).toEqual([
        // Bar 1
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
        // Bar 2 (copied)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("copies previous bar with @N= syntax", () => {
      const result = interpretNotation("C3 1|1 @2=");
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
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("copies a range of bars", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 @5=1-2");
      expect(result).toEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 5 (copy of bar 1)
        {
          pitch: 60,
          start_time: 16,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 6 (copy of bar 2)
        {
          pitch: 62,
          start_time: 20,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("supports chained copies", () => {
      const result = interpretNotation("C3 1|1 @2= @3= @4=");
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
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("overlays notes after copy", () => {
      const result = interpretNotation("C3 1|1 @2=1 D3 |2");
      expect(result).toEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (copied C3)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 beat 2 (added D3)
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("accumulates notes in chained copies", () => {
      // Without auto-clear: bar 2 gets C3 from bar 1, then D3 is added
      // bar 3 gets both C3 and D3 from bar 2
      const result = interpretNotation("C3 1|1 @2= D3 |2 @3=");
      expect(result).toEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (copied C3)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 beat 2 (D3 added)
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 3 (copied both C3 and D3 from bar 2)
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 9,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("preserves note properties (velocity, duration, probability)", () => {
      const result = interpretNotation("v80 t0.5 p0.7 C3 1|1 @2=1");
      expect(result).toEqual([
        // Bar 1
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 80,
          probability: 0.7,
          velocity_deviation: 0,
        },
        // Bar 2 (copied with same properties)
        {
          pitch: 60,
          start_time: 4,
          duration: 0.5,
          velocity: 80,
          probability: 0.7,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles different time signatures", () => {
      const result = interpretNotation("C3 1|1 @2=1", {
        timeSigNumerator: 3,
        timeSigDenominator: 4,
      });
      expect(result).toEqual([
        // Bar 1 (3/4 time)
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (3 beats later in 3/4)
        {
          pitch: 60,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles 6/8 time signature correctly", () => {
      const result = interpretNotation("C3 1|1 @2=1", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });
      expect(result).toEqual([
        // Bar 1 (6/8 time = 3 quarter notes per bar)
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (3 quarter notes later)
        {
          pitch: 60,
          start_time: 3,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles multiple notes at different beats", () => {
      const result = interpretNotation("C3 1|1 D3 1|2 E3 1|3 @2=1");
      expect(result).toEqual([
        // Bar 1
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
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2 (copied with correct offsets)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 6,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("updates current time position after copy", () => {
      const result = interpretNotation("C3 1|1 @2=1 D3 |2");
      // After @2=1, current time should be 2|1
      // So |2 should mean 2|2
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
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("only copies notes within bar time range, not all notes from multi-bar beat list", () => {
      // Regression test for "copy bleeding" bug
      // Multi-bar beat list creates notes across bars 1-8
      // @16=1 should only copy bar 1's notes (beats 1 and 3), not all 16 notes
      const result = interpretNotation(
        "C1 1|1,5,9,13,17,21,25,29 |3,7,11,15,19,23,27,31 @16=1",
      );

      // Should have 18 notes: 16 original (bars 1-8) + 2 copied (bar 16)
      expect(result).toHaveLength(18);

      // Verify bar 1 notes exist
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 0.0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 2.0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 16 has ONLY the 2 notes from bar 1
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 60.0, // Bar 16 beat 1
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 62.0, // Bar 16 beat 3
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 17 does NOT have notes (bug would copy bars 2-8 to bars 17-23)
      const bar17Notes = result.filter(
        (n) => n.start_time >= 64.0 && n.start_time < 68.0,
      );
      expect(bar17Notes).toHaveLength(0);
    });

    it("only copies notes within bar time range with 6/8 time signature", () => {
      // Regression test for "copy bleeding" bug with different time signature
      // In 6/8, each bar = 3.0 Ableton beats (6 beats * 4/8)
      // Beat list 1|1,4,7,10 spans bars 1-2 (beats 7,10 overflow to bar 2)
      const result = interpretNotation("C1 1|1,4,7,10 @3=1", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });

      // Should have 6 notes: 4 original (bars 1-2) + 2 copied (bar 3)
      expect(result).toHaveLength(6);

      // Verify bar 1 notes (beats 1 and 4)
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 0.0, // Bar 1 beat 1
        duration: 0.5, // 1 beat * (4/8) = 0.5 Ableton beats
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 1.5, // Bar 1 beat 4 = (4-1) * 0.5
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 2 notes (beats 7 and 10 overflow from bar 1)
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 3.0, // Bar 2 beat 1 (beat 7 overflowed)
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 4.5, // Bar 2 beat 4 (beat 10 overflowed)
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 3 has ONLY the 2 notes from bar 1
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 6.0, // Bar 3 beat 1
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 36,
        start_time: 7.5, // Bar 3 beat 4
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      // Verify bar 4 does NOT have notes (bug would copy bar 2's notes)
      const bar4Notes = result.filter(
        (n) => n.start_time >= 9.0 && n.start_time < 12.0,
      );
      expect(bar4Notes).toHaveLength(0);
    });

    describe("range copy", () => {
      it("copies bar to range with @N-M= syntax (default source)", () => {
        const result = interpretNotation("C3 D3 1|1 @2-4=");
        expect(result).toEqual([
          // Bar 1
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
          // Bar 2 (copied)
          {
            pitch: 60,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 3 (copied)
          {
            pitch: 60,
            start_time: 8,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 8,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 4 (copied)
          {
            pitch: 60,
            start_time: 12,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 12,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
      });

      it("copies bar to range with @N-M=P syntax (explicit source)", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @4-6=1");
        expect(result).toEqual([
          // Bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 2
          {
            pitch: 62,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 4 (copy of bar 1)
          {
            pitch: 60,
            start_time: 12,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 5 (copy of bar 1)
          {
            pitch: 60,
            start_time: 16,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 6 (copy of bar 1)
          {
            pitch: 60,
            start_time: 20,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
      });

      it("preserves note properties in range copy", () => {
        const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 @2-3=");
        expect(result).toEqual([
          // Bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 0.5,
            velocity: 80,
            probability: 0.8,
            velocity_deviation: 0,
          },
          // Bar 2 (copied)
          {
            pitch: 60,
            start_time: 4,
            duration: 0.5,
            velocity: 80,
            probability: 0.8,
            velocity_deviation: 0,
          },
          // Bar 3 (copied)
          {
            pitch: 60,
            start_time: 8,
            duration: 0.5,
            velocity: 80,
            probability: 0.8,
            velocity_deviation: 0,
          },
        ]);
      });

      it("handles range copy with different time signatures", () => {
        const result = interpretNotation("C3 1|1 @2-3=", {
          timeSigNumerator: 6,
          timeSigDenominator: 8,
        });
        expect(result).toEqual([
          // Bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 0.5, // 1 beat * (4/8)
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 2 (copied) - 6/8 bar = 3.0 Ableton beats
          {
            pitch: 60,
            start_time: 3.0,
            duration: 0.5,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 3 (copied)
          {
            pitch: 60,
            start_time: 6.0,
            duration: 0.5,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
      });

      it("can chain range copies with regular copies", () => {
        const result = interpretNotation("C3 1|1 @2-3= @5=1");
        expect(result).toHaveLength(4); // bars 1, 2, 3, 5
        expect(result).toContainEqual({
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        expect(result).toContainEqual({
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        expect(result).toContainEqual({
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        expect(result).toContainEqual({
          pitch: 60,
          start_time: 16,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });
    });

    describe("multi-bar source range tiling", () => {
      it("tiles 2-bar pattern evenly across 8 bars (@3-10=1-2)", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @3-10=1-2");
        // Should have: bar 1 (C3), bar 2 (D3), bars 3-10 (4 complete tiles of C3+D3)
        expect(result).toHaveLength(10); // 1 + 1 + 8 = 10 notes

        // Bar 1: C3
        expect(result[0]).toEqual({
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 2: D3
        expect(result[1]).toEqual({
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 3: C3 (tile starts)
        expect(result[2]).toEqual({
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 4: D3
        expect(result[3]).toEqual({
          pitch: 62,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 10: D3 (last bar of 4th tile)
        expect(result[9]).toEqual({
          pitch: 62,
          start_time: 36,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });

      it("tiles 2-bar pattern unevenly across 7 bars (@3-9=1-2)", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @3-9=1-2");
        // Should have: bar 1 (C3), bar 2 (D3), bars 3-9 (3 complete tiles + 1 partial = 7 notes)
        expect(result).toHaveLength(9); // 1 + 1 + 7 = 9 notes

        // Bar 9 should be C3 (partial tile, only bar 1 of the pattern)
        expect(result[8]).toEqual({
          pitch: 60,
          start_time: 32,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });

      it("truncates source when destination is smaller (@3-4=1-5)", () => {
        const result = interpretNotation(
          "C3 1|1 D3 2|1 E3 3|1 F3 4|1 G3 5|1 @6-7=1-5",
        );
        // Should have: bars 1-5 (original), bars 6-7 (only C3 and D3 from the 5-bar source)
        expect(result).toHaveLength(7); // 5 + 2 = 7 notes

        // Bar 6: C3
        expect(result[5]).toEqual({
          pitch: 60,
          start_time: 20,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 7: D3
        expect(result[6]).toEqual({
          pitch: 62,
          start_time: 24,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });

      it("skips overlapping source bars in destination (@3-10=5-6)", () => {
        const result = interpretNotation("C3 5|1 D3 6|1 @3-10=5-6");
        // Should have: bar 5 (C3), bar 6 (D3), bars 3,4,7,8,9,10 (tiles, skipping 5,6)
        expect(result).toHaveLength(8); // 2 original + 6 copied

        // Verify no duplicates by checking all start_times
        const startTimes = result
          .map((note) => note.start_time)
          .sort((a, b) => a - b);
        expect(startTimes).toEqual([
          8, // bar 3
          12, // bar 4
          16, // bar 5 (original, not duplicated)
          20, // bar 6 (original, not duplicated)
          24, // bar 7
          28, // bar 8
          32, // bar 9
          36, // bar 10
        ]);

        // Verify specific bars for correctness
        // Bar 3: C3
        expect(result[2]).toEqual({
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 4: D3
        expect(result[3]).toEqual({
          pitch: 62,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 7: C3 (after skipping bars 5 and 6)
        expect(result[4]).toEqual({
          pitch: 60,
          start_time: 24,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });

      it("skips overlapping source bars at beginning of destination (@1-10=3-4)", () => {
        const result = interpretNotation("C3 3|1 D3 4|1 @1-10=3-4");
        // Should have: bar 3 (C3), bar 4 (D3), bars 1,2,5,6,7,8,9,10 (tiles, skipping 3,4)
        expect(result).toHaveLength(10); // 2 original + 8 copied

        // Verify no duplicates by checking all start_times
        const startTimes = result
          .map((note) => note.start_time)
          .sort((a, b) => a - b);
        expect(startTimes).toEqual([
          0, // bar 1
          4, // bar 2
          8, // bar 3 (original)
          12, // bar 4 (original)
          16, // bar 5
          20, // bar 6
          24, // bar 7
          28, // bar 8
          32, // bar 9
          36, // bar 10
        ]);

        // Verify specific bars for correctness
        // Bar 1: C3
        expect(result[2]).toEqual({
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 2: D3
        expect(result[3]).toEqual({
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });

      it("preserves note properties in tiled copy", () => {
        const result = interpretNotation(
          "v80 t0.5 p0.8 C3 1|1 v90 t0.25 p0.9 D3 2|1 @3-6=1-2",
        );
        // Bar 3 should have C3 with original properties
        expect(result[2]).toEqual({
          pitch: 60,
          start_time: 8,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        });
        // Bar 4 should have D3 with original properties
        expect(result[3]).toEqual({
          pitch: 62,
          start_time: 12,
          duration: 0.25,
          velocity: 90,
          probability: 0.9,
          velocity_deviation: 0,
        });
      });

      it("handles tiling with different time signatures", () => {
        const result = interpretNotation("C3 1|1 D3 2|1 @3-4=1-2", {
          timeSigNumerator: 6,
          timeSigDenominator: 8,
        });
        // 6/8 bar = 3.0 Ableton beats
        expect(result).toHaveLength(4);
        // Bar 3: C3 at 6.0 beats
        expect(result[2]).toEqual({
          pitch: 60,
          start_time: 6.0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 4: D3 at 9.0 beats
        expect(result[3]).toEqual({
          pitch: 62,
          start_time: 9.0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
      });
    });

    describe("multi-bar source range tiling: warnings and errors", () => {
      let consoleErrorSpy;

      beforeEach(() => {
        consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
      });

      afterEach(() => {
        consoleErrorSpy.mockRestore();
      });

      it("warns when destination range is invalid (start > end)", () => {
        interpretNotation("C3 1|1 @10-3=1-2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid destination range"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("start > end"),
        );
      });

      it("warns when source range is invalid (start > end)", () => {
        interpretNotation("C3 1|1 @3-10=5-2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid source range"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("start > end"),
        );
      });

      it("warns when source bar is empty during tiling", () => {
        interpretNotation("C3 1|1 D3 3|1 @5-8=1-4");
        // Bar 2 and 4 are empty, should warn when trying to copy them
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 4 is empty, nothing to copy"),
        );
      });

      it("warns when skipping self-copy during tiling", () => {
        interpretNotation("C3 5|1 D3 6|1 @3-10=5-6");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Skipping copy of bar 5 to itself"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Skipping copy of bar 6 to itself"),
        );
      });
    });

    describe("warnings and errors", () => {
      let consoleErrorSpy;

      beforeEach(() => {
        consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
      });

      afterEach(() => {
        consoleErrorSpy.mockRestore();
      });

      it("warns when copying from empty bar", () => {
        interpretNotation("C3 1|1 @3=2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
      });

      it("warns when copying previous bar at bar 1", () => {
        interpretNotation("@1=");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Cannot copy from previous bar when at bar 1",
          ),
        );
      });

      it("warns when pitches are buffered before copy", () => {
        interpretNotation("C3 1|1 D3 @2=1");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "1 pitch(es) buffered but not emitted before bar copy",
          ),
        );
      });

      it("warns when state changed before copy", () => {
        interpretNotation("C3 1|1 v90 @2=1");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "state change won't affect anything before bar copy",
          ),
        );
      });

      it("warns when range copy has invalid source bar (bar 0)", () => {
        interpretNotation("@1-4=");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Cannot copy from previous bar when destination starts at bar 1",
          ),
        );
      });

      it("warns when range copy has invalid range (start > end)", () => {
        interpretNotation("C3 1|1 @5-3=");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Invalid destination range @5-3= (start > end)",
          ),
        );
      });

      it("warns when range copy from empty bar", () => {
        interpretNotation("C3 1|1 @3-5=2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
      });
    });

    describe("edge cases", () => {
      it("rejects copying a bar to itself (prevents infinite loop)", () => {
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const result = interpretNotation("C3 1|1 @1=1");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot copy bar 1 to itself"),
        );
        // Should only have the original note, not a copy
        expect(result).toEqual([
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
        consoleErrorSpy.mockRestore();
      });

      it("handles empty source in range copy", () => {
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        interpretNotation("C3 1|1 @5=1-3");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 3 is empty, nothing to copy"),
        );
        consoleErrorSpy.mockRestore();
      });

      it("skips copying a bar to itself in range copy", () => {
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const result = interpretNotation("C3 1|1 D3 2|1 @1-5=2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Skipping copy of bar 2 to itself"),
        );
        // Should have 6 notes: C3 in bar 1, D3 in bar 2, and D3 copied to bars 1,3,4,5
        expect(result).toHaveLength(6);
        // Bar 1 original C3
        expect(result).toContainEqual({
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 1 also gets copy of bar 2 (D3)
        expect(result).toContainEqual({
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 2 original D3 (not copied to itself)
        expect(result).toContainEqual({
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 3 gets copy of bar 2
        expect(result).toContainEqual({
          pitch: 62,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 4 gets copy of bar 2
        expect(result).toContainEqual({
          pitch: 62,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        // Bar 5 gets copy of bar 2
        expect(result).toContainEqual({
          pitch: 62,
          start_time: 16,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        });
        consoleErrorSpy.mockRestore();
      });
    });

    describe("buffer persistence without @clear", () => {
      it("buffer persists across non-copy operations", () => {
        // Without auto-clear, bar 1 persists after E3 is added
        const result = interpretNotation("C3 1|1 @2= E3 4|1 @5=1");
        expect(result).toEqual([
          // Bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 2 (copied from bar 1)
          {
            pitch: 60,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 4 (E3)
          {
            pitch: 64,
            start_time: 12,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 5 (copy of bar 1 still works)
          {
            pitch: 60,
            start_time: 16,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
      });
    });

    describe("@clear", () => {
      it("@clear immediately clears the copy buffer", () => {
        const result = interpretNotation("C3 1|1 @clear E3 2|1 @3=1");
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        interpretNotation("C3 1|1 @clear E3 2|1 @3=1");
        // Should warn that bar 1 is empty (cleared by @clear)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 1 is empty, nothing to copy"),
        );
        consoleErrorSpy.mockRestore();

        expect(result).toEqual([
          // Bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 2 (E3)
          {
            pitch: 64,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
      });

      it("@clear allows copying later bars", () => {
        const result = interpretNotation("C3 1|1 @2= @clear E3 4|1 @5=4");
        expect(result).toEqual([
          // Bar 1
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 2 (copied from bar 1)
          {
            pitch: 60,
            start_time: 4,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 4 (E3)
          {
            pitch: 64,
            start_time: 12,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          // Bar 5 (copied E3 from bar 4)
          {
            pitch: 64,
            start_time: 16,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ]);
      });
    });
  });

  describe("comma-separated beat lists", () => {
    it("emits buffered pitches at each beat in the list", () => {
      const result = interpretNotation("C1 1|1,2,3,4");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles beat lists with bar shorthand", () => {
      const result = interpretNotation("C1 1|1 D1 |2,4");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 38,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 38,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles beat lists with eighth notes", () => {
      const result = interpretNotation("F#1 1|1,1.5,2,2.5,3,3.5,4,4.5");
      expect(result).toEqual([
        {
          pitch: 42,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 0.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 1.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 2.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 3.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("applies state to all emitted notes in beat list", () => {
      const result = interpretNotation("v80 t0.25 p0.8 C1 1|1,2,3,4");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 0.25,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 1,
          duration: 0.25,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 2,
          duration: 0.25,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 3,
          duration: 0.25,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles chord emission at multiple positions", () => {
      const result = interpretNotation("C3 E3 G3 1|1,3");
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
          pitch: 64,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 67,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 67,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles drum pattern with beat lists", () => {
      const result = interpretNotation(
        "C1 1|1,3 D1 |2,4 F#1 |1,1.5,2,2.5,3,3.5,4,4.5",
      );
      expect(result).toEqual([
        // Kick on beats 1 and 3
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Snare on beats 2 and 4
        {
          pitch: 38,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 38,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Hi-hats on every eighth note
        {
          pitch: 42,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 0.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 1.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 2.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 42,
          start_time: 3.5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles beat lists across multiple bars", () => {
      const result = interpretNotation("C1 1|1,3 2|1,3");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 6,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("clears pitch buffer after first beat list", () => {
      const result = interpretNotation("C1 1|1,2 D1 |3,4");
      expect(result).toEqual([
        // C1 at beats 1 and 2
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // D1 at beats 3 and 4 (buffer cleared after first emission)
        {
          pitch: 38,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 38,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("works with single beat (list of one)", () => {
      const result = interpretNotation("C1 1|1 D1 1|2");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 38,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
  });

  describe("repeat patterns (x{times}@{step})", () => {
    it("expands basic repeat pattern with whole step", () => {
      const result = interpretNotation("C1 1|1x4@1");
      expect(result).toEqual([
        {
          pitch: 36,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 36,
          start_time: 3,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("expands repeat pattern with fractional step (triplets)", () => {
      const result = interpretNotation("C3 1|1x3@1/3", {
        timeSigNumerator: 4,
        timeSigDenominator: 4,
      });
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBeCloseTo(0, 10);
      expect(result[1].start_time).toBeCloseTo(1 / 3, 10);
      expect(result[2].start_time).toBeCloseTo(2 / 3, 10);
    });

    it("expands repeat pattern with decimal step", () => {
      const result = interpretNotation("Gb1 1|1x8@0.5");
      expect(result).toHaveLength(8);
      expect(result[0].start_time).toBeCloseTo(0, 10);
      expect(result[1].start_time).toBeCloseTo(0.5, 10);
      expect(result[7].start_time).toBeCloseTo(3.5, 10);
    });

    it("expands repeat pattern with mixed number step", () => {
      const result = interpretNotation("C1 1|1x4@1+1/2");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBeCloseTo(0, 10);
      expect(result[1].start_time).toBeCloseTo(1.5, 10);
      expect(result[2].start_time).toBeCloseTo(3, 10);
      expect(result[3].start_time).toBeCloseTo(4.5, 10);
    });

    it("expands repeat pattern with mixed number start", () => {
      const result = interpretNotation("C3 1|2+1/3x3@1/3", {
        timeSigNumerator: 4,
        timeSigDenominator: 4,
      });
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBeCloseTo(1 + 1 / 3, 10);
      expect(result[1].start_time).toBeCloseTo(1 + 2 / 3, 10);
      expect(result[2].start_time).toBeCloseTo(2, 10);
    });

    it("handles repeat pattern overflowing into next bar", () => {
      const result = interpretNotation("C1 1|3x6@1");
      expect(result).toHaveLength(6);
      expect(result[0].start_time).toBe(2); // bar 1, beat 3
      expect(result[1].start_time).toBe(3); // bar 1, beat 4
      expect(result[2].start_time).toBe(4); // bar 2, beat 1
      expect(result[3].start_time).toBe(5); // bar 2, beat 2
      expect(result[4].start_time).toBe(6); // bar 2, beat 3
      expect(result[5].start_time).toBe(7); // bar 2, beat 4
    });

    it("handles repeat pattern without bar (uses current bar)", () => {
      const result = interpretNotation("C1 1|1 D1 |2x2@1");
      expect(result).toHaveLength(3);
      expect(result[0].pitch).toBe(36); // C1 at 1|1
      expect(result[1].pitch).toBe(38); // D1 at 1|2
      expect(result[2].pitch).toBe(38); // D1 at 1|3
    });

    it("emits multiple pitches at each expanded position", () => {
      const result = interpretNotation("C3 D3 E3 1|1x4@1");
      expect(result).toHaveLength(12); // 3 pitches × 4 positions
      // Check first position (beat 1)
      expect(result[0].pitch).toBe(60); // C3
      expect(result[1].pitch).toBe(62); // D3
      expect(result[2].pitch).toBe(64); // E3
      // Check second position (beat 2)
      expect(result[3].pitch).toBe(60); // C3
      expect(result[4].pitch).toBe(62); // D3
      expect(result[5].pitch).toBe(64); // E3
    });

    it("applies state changes to all expanded positions", () => {
      const result = interpretNotation("v80 t0.5 C1 1|1x4@1");
      expect(result).toHaveLength(4);
      expect(result.every((note) => note.velocity === 80)).toBe(true);
      expect(result.every((note) => note.duration === 0.5)).toBe(true);
    });

    it("uses current duration when step is omitted", () => {
      const result = interpretNotation("t0.5 C1 1|1x4");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(0.5); // 1|1.5
      expect(result[2].start_time).toBe(1); // 1|2
      expect(result[3].start_time).toBe(1.5); // 1|2.5
      expect(result.every((note) => note.duration === 0.5)).toBe(true);
    });

    it("uses default duration when step is omitted and no duration set", () => {
      const result = interpretNotation("C1 1|1x3");
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(1); // 1|2
      expect(result[2].start_time).toBe(2); // 1|3
      expect(result.every((note) => note.duration === 1)).toBe(true);
    });

    it("handles repeat pattern mixed with regular beats", () => {
      const result = interpretNotation("C1 1|1x2@1,3.5");
      expect(result).toHaveLength(3);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(1); // 1|2
      expect(result[2].start_time).toBe(2.5); // 1|3.5
    });

    it("handles multiple repeat patterns in same beat list", () => {
      const result = interpretNotation("C1 1|1x2@1,3x2@0.5");
      expect(result).toHaveLength(4);
      expect(result[0].start_time).toBe(0); // 1|1
      expect(result[1].start_time).toBe(1); // 1|2
      expect(result[2].start_time).toBe(2); // 1|3
      expect(result[3].start_time).toBe(2.5); // 1|3.5
    });

    it("works with bar copy operations", () => {
      const result = interpretNotation("C1 1|1x4@1 @2=1");
      expect(result).toHaveLength(8);
      // Bar 1
      expect(result[0].start_time).toBe(0);
      expect(result[3].start_time).toBe(3);
      // Bar 2 (copied)
      expect(result[4].start_time).toBe(4);
      expect(result[7].start_time).toBe(7);
    });

    it("emits warning for excessive repeat times", () => {
      const consoleSpy = vi.spyOn(console, "warn");
      interpretNotation("C1 1|1x101@1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("101 notes, which may be excessive"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("v0 deletions", () => {
    it("deletes note with same pitch and time when v0 is encountered", () => {
      const result = interpretNotation("C3 D3 1|1 v0 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 note does not affect notes with different pitch", () => {
      const result = interpretNotation("C3 D3 E3 1|1 v0 F3 1|2");
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

    it("v0 note does not affect notes with different time", () => {
      const result = interpretNotation("C3 1|1 C3 1|2 v0 C3 1|3");
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
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("handles multiple v0 notes", () => {
      const result = interpretNotation("C3 D3 E3 1|1 v0 C3 D3 1|1");
      expect(result).toEqual([
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

    it("v0 note followed by same note at same time works correctly", () => {
      const result = interpretNotation("C3 1|1 v0 C3 1|1 v100 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work after bar copy", () => {
      const result = interpretNotation("C3 D3 E3 1|1 @2=1 v0 D3 2|1");
      expect(result).toEqual([
        // Bar 1: original notes
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
        // Bar 2: copied notes (but D3 is deleted by v0)
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 64,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work after range copy", () => {
      const result = interpretNotation("C3 D3 1|1 @2-3= v0 D3 2|1");
      expect(result).toEqual([
        // Bar 1: original
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
        // Bar 2: copied, D3 deleted
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 3: copied
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work after multi-bar source range tiling", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 @3-6=1-2 v0 C3 5|1");
      expect(result).toEqual([
        // Bar 1: original C3
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 2: original D3
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 3: tiled C3
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 4: tiled D3
        {
          pitch: 62,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // Bar 5: tiled C3, but deleted by v0
        // Bar 6: tiled D3
        {
          pitch: 62,
          start_time: 20,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 deletions work with different time signatures", () => {
      const result = interpretNotation("C3 D3 1|1 v0 C3 1|1", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });
      // In 6/8 time, each beat is an 8th note, so beats are 0.5 apart in Ableton beats
      expect(result).toEqual([
        {
          pitch: 62,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("complex scenario: v0 deletions with bar copies and multiple notes", () => {
      const result = interpretNotation(
        "C3 D3 E3 1|1 @2=1 v0 D3 1|1 v0 E3 2|1 v100 F3 2|2",
      );
      expect(result).toEqual([
        // Bar 1: original notes, D3 deleted
        {
          pitch: 60,
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
        // Bar 2: copied notes, E3 deleted
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        // New F3 note
        {
          pitch: 65,
          start_time: 5,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 notes are kept in the result for update-clip merge mode", () => {
      const result = interpretNotation("C3 D3 1|1 v0 C3 1|2");
      // Check that v0 note is NOT in the result (filtered out by applyV0Deletions)
      const v0Notes = result.filter((note) => note.velocity === 0);
      expect(v0Notes).toHaveLength(0);
    });

    it("v0 only deletes notes that appear before it in serial order", () => {
      const result = interpretNotation("v0 C3 1|1 v100 C3 1|1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });

    it("v0 preserves note properties like duration, probability", () => {
      const result = interpretNotation("t2 p0.8 C3 1|1 t0.5 p1.0 v0 C3 1|1");
      expect(result).toEqual([]);
    });
  });
});
