import { describe, expect, it } from "vitest";
import { interpretNotation } from "./barbeat-interpreter";

describe("bar|beat interpretNotation() - comma-separated beat lists", () => {
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
