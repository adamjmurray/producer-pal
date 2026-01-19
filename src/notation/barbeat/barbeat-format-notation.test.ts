import { describe, expect, it } from "vitest";
import { createNote } from "#src/test/test-data-builders.js";
import type { NoteEvent } from "../types.js";
import { formatNotation } from "./barbeat-format-notation.js";
import { interpretNotation } from "./interpreter/barbeat-interpreter.js";

describe("bar|beat formatNotation()", () => {
  it("returns empty string for empty input", () => {
    expect(formatNotation([])).toBe("");
    expect(formatNotation(null)).toBe("");
    expect(formatNotation(undefined)).toBe("");
  });

  it("formats simple notes with defaults", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62 }),
      createNote({ pitch: 64 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("C3 D3 E3 1|1");
  });

  it("formats notes with time changes", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 64, start_time: 4 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("C3 1|1 D3 1|2 E3 2|1");
  });

  it("formats notes with probability changes", () => {
    const notes = [
      createNote({ probability: 0.8 }),
      createNote({ pitch: 62, probability: 0.5 }),
      createNote({ pitch: 64, probability: 0.5 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("p0.8 C3 p0.5 D3 E3 1|1");
  });

  it("formats notes with velocity changes", () => {
    const notes = [
      createNote({ velocity: 80 }),
      createNote({ pitch: 62, velocity: 120 }),
      createNote({ pitch: 64, velocity: 120 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("v80 C3 v120 D3 E3 1|1");
  });

  it("formats notes with velocity range changes", () => {
    const notes = [
      createNote({ velocity: 80, velocity_deviation: 40 }),
      createNote({ pitch: 62, velocity: 60, velocity_deviation: 40 }),
      createNote({ pitch: 64, velocity: 60, velocity_deviation: 40 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("v80-120 C3 v60-100 D3 E3 1|1");
  });

  it("formats notes with mixed velocity and velocity range", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62, velocity: 80, velocity_deviation: 40 }),
      createNote({ pitch: 64, velocity: 90 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("C3 v80-120 D3 v90 E3 1|1");
  });

  it("formats notes with duration changes", () => {
    const notes = [
      createNote({ duration: 0.5 }),
      createNote({ pitch: 62, duration: 2.0 }),
      createNote({ pitch: 64, duration: 2.0 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("t0.5 C3 t2 D3 E3 1|1");
  });

  it("formats sub-beat timing", () => {
    const notes = [
      createNote({ start_time: 0.5 }),
      createNote({ pitch: 62, start_time: 1.25 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("C3 1|1.5 D3 1|2.25");
  });

  it("handles different time signatures with beatsPerBar option (legacy)", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62, start_time: 3 }),
    ] as NoteEvent[];
    const result = formatNotation(notes, { beatsPerBar: 3 });

    expect(result).toBe("C3 1|1 D3 2|1");
  });

  it("handles different time signatures with timeSigNumerator/timeSigDenominator", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62, start_time: 3 }),
    ] as NoteEvent[];
    const result = formatNotation(notes, {
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });

    expect(result).toBe("C3 1|1 D3 2|1");
  });

  it("prefers timeSigNumerator/timeSigDenominator over beatsPerBar", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62, start_time: 3 }),
    ] as NoteEvent[];
    const result = formatNotation(notes, {
      beatsPerBar: 4,
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });

    expect(result).toBe("C3 1|1 D3 2|1"); // Uses 3 beats per bar, not 4
  });

  it("throws error when only timeSigNumerator is provided", () => {
    expect(() =>
      formatNotation([createNote()] as NoteEvent[], { timeSigNumerator: 4 }),
    ).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("throws error when only timeSigDenominator is provided", () => {
    expect(() =>
      formatNotation([createNote()] as NoteEvent[], { timeSigDenominator: 4 }),
    ).toThrow(
      "Time signature must be specified with both numerator and denominator",
    );
  });

  it("omits redundant state changes", () => {
    const notes = [
      createNote(),
      createNote({ pitch: 62, start_time: 1 }),
      createNote({ pitch: 64, start_time: 2 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("C3 1|1 D3 1|2 E3 1|3");
  });

  it("sorts notes by time then pitch", () => {
    const notes = [
      createNote({ pitch: 64 }),
      createNote(),
      createNote({ pitch: 62 }),
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("C3 D3 E3 1|1");
  });

  it("creates roundtrip compatibility with interpretNotation", () => {
    const original = "1|1 p0.8 v80-120 t0.5 C3 D3 1|2.25 v120 p1.0 t2 E3 F3";
    const parsed = interpretNotation(original);
    const formatted = formatNotation(parsed);
    const reparsed = interpretNotation(formatted);

    expect(parsed).toStrictEqual(reparsed);
  });

  it("creates roundtrip compatibility with interpretNotation using time signatures", () => {
    const original = "1|1 p0.8 v80-120 t0.5 C3 D3 1|2.25 v120 p1.0 t2 E3 F3";
    const parsed = interpretNotation(original, {
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });
    const formatted = formatNotation(parsed, {
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });
    const reparsed = interpretNotation(formatted, {
      timeSigNumerator: 3,
      timeSigDenominator: 4,
    });

    expect(parsed).toStrictEqual(reparsed);
  });

  it("handles complex drum pattern with probability and velocity range", () => {
    const notes = [
      createNote({ pitch: 36, duration: 0.25 }), // C1 (kick)
      createNote({
        pitch: 42,
        duration: 0.25,
        velocity: 80,
        probability: 0.8,
        velocity_deviation: 20,
      }), // Gb1 (hihat)
      createNote({
        pitch: 42,
        start_time: 0.5,
        duration: 0.25,
        velocity: 80,
        probability: 0.6,
        velocity_deviation: 20,
      }), // Gb1 (hihat)
      createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }), // D1 (snare)
      createNote({
        pitch: 42,
        start_time: 1,
        duration: 0.25,
        probability: 0.9,
      }), // Gb1 (hihat)
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe(
      "t0.25 C1 v80-100 p0.8 Gb1 1|1 p0.6 Gb1 1|1.5 v90 p1 D1 v100 p0.9 Gb1 1|2",
    );
  });

  it("handles notes with missing probability and velocity_deviation properties", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 80 }, // Missing probability and velocity_deviation
      {
        pitch: 62,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 0.7,
      }, // Missing velocity_deviation
      {
        pitch: 64,
        start_time: 0,
        duration: 1,
        velocity: 100,
        velocity_deviation: 20,
      }, // Missing probability
    ] as NoteEvent[];
    const result = formatNotation(notes);

    expect(result).toBe("v80 C3 v100 p0.7 D3 v100-120 p1 E3 1|1");
  });

  it("throws error for invalid MIDI pitch", () => {
    expect(() =>
      formatNotation([createNote({ pitch: -1 })] as NoteEvent[]),
    ).toThrow("Invalid MIDI pitch: -1");
  });
});
