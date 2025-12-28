import { describe, expect, it } from "vitest";
import { interpretNotation } from "../barbeat-interpreter.js";

describe("bar|beat interpretNotation() - time signatures", () => {
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
      },
      {
        pitch: 62,
        start_time: 3,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
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
      },
      {
        pitch: 62,
        start_time: 3,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      },
    ]);
  });
  it("converts time signatures with half-note denominators correctly", () => {
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
      },
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
      },
    ]);
  });
  it("converts time signatures with different denominators correctly", () => {
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
      },
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
});
