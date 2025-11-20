import { describe, expect, it } from "vitest";
import { interpretNotation } from "../barbeat-interpreter.js";

describe("bar|beat interpretNotation() - comment support", () => {
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
