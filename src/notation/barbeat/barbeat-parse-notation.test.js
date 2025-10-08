import { describe, expect, it, vi } from "vitest";
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

  describe("bar copy", () => {
    it("copies a single bar to a different position", () => {
      const result = parseNotation("C3 D3 E3 1|1 @2=1");
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
      const result = parseNotation("C3 1|1 @2=");
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
      const result = parseNotation("C3 1|1 D3 2|1 @5=1-2");
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
      const result = parseNotation("C3 1|1 @2= @3= @4=");
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
      const result = parseNotation("C3 1|1 @2=1 D3 |2");
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
      const result = parseNotation("C3 1|1 @2= D3 |2 @3=");
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
      const result = parseNotation("v80 t0.5 p0.7 C3 1|1 @2=1");
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
      const result = parseNotation("C3 1|1 @2=1", {
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
      const result = parseNotation("C3 1|1 @2=1", {
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
      const result = parseNotation("C3 1|1 D3 1|2 E3 1|3 @2=1");
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
      const result = parseNotation("C3 1|1 @2=1 D3 |2");
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
      const result = parseNotation(
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
      const result = parseNotation("C1 1|1,4,7,10 @3=1", {
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
        const result = parseNotation("C3 D3 1|1 @2-4=");
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
        const result = parseNotation("C3 1|1 D3 2|1 @4-6=1");
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
        const result = parseNotation("v80 t0.5 p0.8 C3 1|1 @2-3=");
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
        const result = parseNotation("C3 1|1 @2-3=", {
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
        const result = parseNotation("C3 1|1 @2-3= @5=1");
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
        const result = parseNotation("C3 1|1 D3 2|1 @3-10=1-2");
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
        const result = parseNotation("C3 1|1 D3 2|1 @3-9=1-2");
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
        const result = parseNotation(
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
        const result = parseNotation("C3 5|1 D3 6|1 @3-10=5-6");
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
        const result = parseNotation("C3 3|1 D3 4|1 @1-10=3-4");
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
        const result = parseNotation(
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
        const result = parseNotation("C3 1|1 D3 2|1 @3-4=1-2", {
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
        parseNotation("C3 1|1 @10-3=1-2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid destination range"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("start > end"),
        );
      });

      it("warns when source range is invalid (start > end)", () => {
        parseNotation("C3 1|1 @3-10=5-2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid source range"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("start > end"),
        );
      });

      it("warns when source bar is empty during tiling", () => {
        parseNotation("C3 1|1 D3 3|1 @5-8=1-4");
        // Bar 2 and 4 are empty, should warn when trying to copy them
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 4 is empty, nothing to copy"),
        );
      });

      it("warns when skipping self-copy during tiling", () => {
        parseNotation("C3 5|1 D3 6|1 @3-10=5-6");
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
        parseNotation("C3 1|1 @3=2");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Bar 2 is empty, nothing to copy"),
        );
      });

      it("warns when copying previous bar at bar 1", () => {
        parseNotation("@1=");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Cannot copy from previous bar when at bar 1",
          ),
        );
      });

      it("warns when pitches are buffered before copy", () => {
        parseNotation("C3 1|1 D3 @2=1");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "1 pitch(es) buffered but not emitted before bar copy",
          ),
        );
      });

      it("warns when state changed before copy", () => {
        parseNotation("C3 1|1 v90 @2=1");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "state change won't affect anything before bar copy",
          ),
        );
      });

      it("warns when range copy has invalid source bar (bar 0)", () => {
        parseNotation("@1-4=");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Cannot copy from previous bar when destination starts at bar 1",
          ),
        );
      });

      it("warns when range copy has invalid range (start > end)", () => {
        parseNotation("C3 1|1 @5-3=");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Invalid destination range @5-3= (start > end)",
          ),
        );
      });

      it("warns when range copy from empty bar", () => {
        parseNotation("C3 1|1 @3-5=2");
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
        const result = parseNotation("C3 1|1 @1=1");
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
        parseNotation("C3 1|1 @5=1-3");
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
        const result = parseNotation("C3 1|1 D3 2|1 @1-5=2");
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
        const result = parseNotation("C3 1|1 @2= E3 4|1 @5=1");
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
        const result = parseNotation("C3 1|1 @clear E3 2|1 @3=1");
        const consoleErrorSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        parseNotation("C3 1|1 @clear E3 2|1 @3=1");
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
        const result = parseNotation("C3 1|1 @2= @clear E3 4|1 @5=4");
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
      const result = parseNotation("C1 1|1,2,3,4");
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
      const result = parseNotation("C1 1|1 D1 |2,4");
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
      const result = parseNotation("F#1 1|1,1.5,2,2.5,3,3.5,4,4.5");
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
      const result = parseNotation("v80 t0.25 p0.8 C1 1|1,2,3,4");
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
      const result = parseNotation("C3 E3 G3 1|1,3");
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
      const result = parseNotation(
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
      const result = parseNotation("C1 1|1,3 2|1,3");
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
      const result = parseNotation("C1 1|1,2 D1 |3,4");
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
      const result = parseNotation("C1 1|1 D1 1|2");
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
});
