import { describe, expect, it } from "vitest";
import { parseNotation } from "./barbeat-parse-notation";

describe("bar|beat parseNotation()", () => {
  it("returns empty array for empty input", () => {
    expect(parseNotation("")).toEqual([]);
    expect(parseNotation(null)).toEqual([]);
    expect(parseNotation(undefined)).toEqual([]);
  });

  it("parses simple notes with defaults", () => {
    const result = parseNotation("C3 D3 E3 1|1");
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
    const result = parseNotation("C3 1|1 D3 1|2 E3 2|1");
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
    const result = parseNotation("v80 C3 v120 D3 E3 1|1");
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
    const result = parseNotation("v80-120 C3 v60-100 D3 E3 1|1");
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
    const result = parseNotation("v100 C3 v80-120 D3 v90 E3 1|1");
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
    const result = parseNotation("p0.8 C3 p0.5 D3 E3 1|1");
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
    const result = parseNotation("t0.5 C3 t2.0 D3 E3 1|1");
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
    const result = parseNotation("C3 1|1.5 D3 |2.25");
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
    const result = parseNotation(`
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
    const result = parseNotation("C3 1|1 D3 2|1", { beatsPerBar: 3 });
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
    const result = parseNotation("C3 1|1 D3 2|1", {
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
    const result = parseNotation("C3 1|1 D3 1|2", {
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
    const result = parseNotation("C3 1|1 D3 2|1", {
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
    const result = parseNotation("C3 1|1 D3 1|3", {
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
    const result = parseNotation("v80 t0.5 p0.8 C3 1|1 D3 3|2 E3 5|1");
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
    const result = parseNotation("t0.5 v80 p0.7 C3 1|1 v100 t1.0 p1.0 D3 2|1");
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
    const result = parseNotation("C#3 Db3 F#3 Gb3 1|1");
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
    const result = parseNotation("v100 C3 v0 D3 v80 E3 1|1");
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
    const result = parseNotation("v0-50 C3 v50-100 D3 1|1");
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
    const result = parseNotation("v0 C3 D3 E3 1|1");
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

  describe("comment support", () => {
    it("handles line comments with //", () => {
      const result = parseNotation("C3 1|1 // this is a C major");
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
      const result = parseNotation("C1 1|1 # kick drum");
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
      const result = parseNotation("/* velocity */ v100 C3 1|1");
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
      const result = parseNotation(`C3 /* this is a
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
      const result = parseNotation("// start comment\nC3 1|1");
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
      const result = parseNotation("C3 D3 1|1 // end comment");
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
      const result = parseNotation("/* middle */ C3 1|1");
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
      const result = parseNotation(
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
      const result = parseNotation("C3 1|1 // \nD3 1|2 # \n/**/ E3 1|3");
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
      const result = parseNotation(
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
      const result = parseNotation("C3 1|1 // C major chord!@#$%^&*()");
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
      const result = parseNotation(`
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
      const result = parseNotation("C1 1|1");
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
      const result = parseNotation("C1 1|1 |2 |3 |4");
      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result[0].start_time).toBe(0);
      expect(result[1].start_time).toBe(1);
      expect(result[2].start_time).toBe(2);
      expect(result[3].start_time).toBe(3);
    });

    it("clears pitch buffer on first pitch after time", () => {
      const result = parseNotation("C1 1|1 D1 1|2");
      expect(result).toHaveLength(2);
      expect(result[0].pitch).toBe(36); // C1
      expect(result[0].start_time).toBe(0);
      expect(result[1].pitch).toBe(38); // D1
      expect(result[1].start_time).toBe(1);
    });

    it("emits chord from buffered pitches", () => {
      const result = parseNotation("C3 E3 G3 1|1");
      expect(result).toHaveLength(3);
      expect(result.every((n) => n.start_time === 0)).toBe(true);
      expect(result[0].pitch).toBe(60); // C3
      expect(result[1].pitch).toBe(64); // E3
      expect(result[2].pitch).toBe(67); // G3
    });

    it("captures state with each pitch", () => {
      const result = parseNotation("v100 C3 v80 E3 1|1");
      expect(result).toHaveLength(2);
      expect(result[0].pitch).toBe(60); // C3
      expect(result[0].velocity).toBe(100);
      expect(result[1].pitch).toBe(64); // E3
      expect(result[1].velocity).toBe(80);
    });

    it("updates buffered pitches when state changes after time", () => {
      const result = parseNotation("v100 C4 1|1 v90 |2");
      expect(result).toHaveLength(2);
      expect(result[0].pitch).toBe(72); // C4
      expect(result[0].velocity).toBe(100);
      expect(result[0].start_time).toBe(0);
      expect(result[1].pitch).toBe(72); // C4
      expect(result[1].velocity).toBe(90);
      expect(result[1].start_time).toBe(1);
    });

    it("handles complex state updates with multiple pitches", () => {
      const result = parseNotation("v80 C4 v90 G4 1|1 v100 |2");
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
      const result = parseNotation("C4 1|1 t0.5 |2 t0.25 |3");
      expect(result).toHaveLength(3);
      expect(result[0].duration).toBe(1);
      expect(result[1].duration).toBe(0.5);
      expect(result[2].duration).toBe(0.25);
    });

    it("handles probability updates after time", () => {
      const result = parseNotation("C4 1|1 p0.8 |2 p0.5 |3");
      expect(result).toHaveLength(3);
      expect(result[0].probability).toBe(1.0);
      expect(result[1].probability).toBe(0.8);
      expect(result[2].probability).toBe(0.5);
    });

    it("handles velocity range updates after time", () => {
      const result = parseNotation("C4 1|1 v80-100 |2");
      expect(result).toHaveLength(2);
      expect(result[0].velocity).toBe(100);
      expect(result[0].velocity_deviation).toBe(0);
      expect(result[1].velocity).toBe(80);
      expect(result[1].velocity_deviation).toBe(20);
    });

    it("supports drum patterns", () => {
      const result = parseNotation("C1 1|1 |2 |3 |4");
      expect(result).toHaveLength(4);
      expect(result.every((n) => n.pitch === 36)).toBe(true);
      expect(result.map((n) => n.start_time)).toEqual([0, 1, 2, 3]);
    });

    it("supports layered drum patterns", () => {
      const result = parseNotation("C1 1|1 |3  D1 1|2 |4");
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
      const result = parseNotation("v80 C4 v90 G4 1|1");
      expect(result).toHaveLength(2);
      expect(result[0].velocity).toBe(80);
      expect(result[1].velocity).toBe(90);
    });

    it("warns when pitches buffered but no time position", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      parseNotation("C3 E3 G3");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("3 pitch(es) buffered but no time position"),
      );
      consoleSpy.mockRestore();
    });

    it("warns when time position has no pitches", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      parseNotation("1|1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Time position 1|1 has no pitches"),
      );
      consoleSpy.mockRestore();
    });

    it("warns when state changes after pitch but before time", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      parseNotation("C4 v100 1|1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "state change after pitch(es) but before time position won't affect this group",
        ),
      );
      consoleSpy.mockRestore();
    });

    it("does not warn when state changes after pitch but before another pitch", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      const result = parseNotation("v80 C4 v90 G4 1|1");
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
      const result = parseNotation("C4 1|1 v90 |2");
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
      const result = parseNotation("C3 1|1 |2 |3");
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
      const result = parseNotation("C3 1|1 D3 2|1 E3 |2 F3 |3");
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
      const result = parseNotation("C3 1|1 D3 |2 E3 3|1 F3 |4 G3 2|3 A3 |4");
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
      const result = parseNotation("C3 1|1.5 D3 |2.25 E3 |3.75");
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
      const result = parseNotation("v80 t0.5 p0.8 C3 1|1 D3 |2 v100 E3 |3");
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
      const result = parseNotation("C3 1|1 D3 |2 E3 |3", {
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
      const result = parseNotation("C3 |2");
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
      const result = parseNotation("v100 t0.5 C3 |2");
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
      const result = parseNotation("v100 C3 |1");
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
});
