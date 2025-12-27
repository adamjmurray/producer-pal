import { describe, it, expect } from "vitest";
import {
  PITCH_CLASS_NAMES,
  PITCH_CLASS_VALUES,
  VALID_PITCH_CLASS_NAMES,
  isValidMidi,
  isValidPitchName,
  isValidPitchClassName,
  pitchClassToNumber,
  numberToPitchClass,
  midiToPitchName,
  pitchNameToMidi,
} from "./pitch.js";

describe("PITCH_CLASS_NAMES", () => {
  it("has 12 pitch classes", () => {
    expect(PITCH_CLASS_NAMES).toHaveLength(12);
  });

  it("uses flats for black keys", () => {
    expect(PITCH_CLASS_NAMES[1]).toBe("Db");
    expect(PITCH_CLASS_NAMES[3]).toBe("Eb");
    expect(PITCH_CLASS_NAMES[6]).toBe("Gb");
    expect(PITCH_CLASS_NAMES[8]).toBe("Ab");
    expect(PITCH_CLASS_NAMES[10]).toBe("Bb");
  });

  it("is frozen/immutable", () => {
    expect(Object.isFrozen(PITCH_CLASS_NAMES)).toBe(true);
  });
});

describe("PITCH_CLASS_VALUES", () => {
  it("maps all natural notes correctly", () => {
    expect(PITCH_CLASS_VALUES.C).toBe(0);
    expect(PITCH_CLASS_VALUES.D).toBe(2);
    expect(PITCH_CLASS_VALUES.E).toBe(4);
    expect(PITCH_CLASS_VALUES.F).toBe(5);
    expect(PITCH_CLASS_VALUES.G).toBe(7);
    expect(PITCH_CLASS_VALUES.A).toBe(9);
    expect(PITCH_CLASS_VALUES.B).toBe(11);
  });

  it("supports both sharps and flats for enharmonic equivalents", () => {
    expect(PITCH_CLASS_VALUES["C#"]).toBe(1);
    expect(PITCH_CLASS_VALUES.Db).toBe(1);
    expect(PITCH_CLASS_VALUES["D#"]).toBe(3);
    expect(PITCH_CLASS_VALUES.Eb).toBe(3);
    expect(PITCH_CLASS_VALUES["F#"]).toBe(6);
    expect(PITCH_CLASS_VALUES.Gb).toBe(6);
    expect(PITCH_CLASS_VALUES["G#"]).toBe(8);
    expect(PITCH_CLASS_VALUES.Ab).toBe(8);
    expect(PITCH_CLASS_VALUES["A#"]).toBe(10);
    expect(PITCH_CLASS_VALUES.Bb).toBe(10);
  });

  it("is frozen/immutable", () => {
    expect(Object.isFrozen(PITCH_CLASS_VALUES)).toBe(true);
  });
});

describe("VALID_PITCH_CLASS_NAMES", () => {
  it("includes all expected pitch class names", () => {
    expect(VALID_PITCH_CLASS_NAMES).toContain("C");
    expect(VALID_PITCH_CLASS_NAMES).toContain("C#");
    expect(VALID_PITCH_CLASS_NAMES).toContain("Db");
    expect(VALID_PITCH_CLASS_NAMES).toContain("Bb");
  });

  it("is frozen/immutable", () => {
    expect(Object.isFrozen(VALID_PITCH_CLASS_NAMES)).toBe(true);
  });
});

describe("isValidMidi", () => {
  it("returns true for valid MIDI values", () => {
    expect(isValidMidi(0)).toBe(true);
    expect(isValidMidi(60)).toBe(true);
    expect(isValidMidi(127)).toBe(true);
  });

  it("returns false for values below range", () => {
    expect(isValidMidi(-1)).toBe(false);
    expect(isValidMidi(-100)).toBe(false);
  });

  it("returns false for values above range", () => {
    expect(isValidMidi(128)).toBe(false);
    expect(isValidMidi(1000)).toBe(false);
  });

  it("returns false for non-integers", () => {
    expect(isValidMidi(60.5)).toBe(false);
    expect(isValidMidi(60.1)).toBe(false);
  });

  it("returns false for non-numbers", () => {
    expect(isValidMidi(null)).toBe(false);
    expect(isValidMidi(undefined)).toBe(false);
    expect(isValidMidi("60")).toBe(false);
    expect(isValidMidi(NaN)).toBe(false);
  });
});

describe("isValidPitchName", () => {
  it("returns true for valid natural notes", () => {
    expect(isValidPitchName("C3")).toBe(true);
    expect(isValidPitchName("D4")).toBe(true);
    expect(isValidPitchName("E5")).toBe(true);
    expect(isValidPitchName("F2")).toBe(true);
    expect(isValidPitchName("G1")).toBe(true);
    expect(isValidPitchName("A0")).toBe(true);
    expect(isValidPitchName("B6")).toBe(true);
  });

  it("returns true for sharps", () => {
    expect(isValidPitchName("C#3")).toBe(true);
    expect(isValidPitchName("D#4")).toBe(true);
    expect(isValidPitchName("F#5")).toBe(true);
    expect(isValidPitchName("G#2")).toBe(true);
    expect(isValidPitchName("A#1")).toBe(true);
  });

  it("returns true for flats", () => {
    expect(isValidPitchName("Db3")).toBe(true);
    expect(isValidPitchName("Eb4")).toBe(true);
    expect(isValidPitchName("Gb5")).toBe(true);
    expect(isValidPitchName("Ab2")).toBe(true);
    expect(isValidPitchName("Bb1")).toBe(true);
  });

  it("returns true for negative octaves", () => {
    expect(isValidPitchName("C-2")).toBe(true);
    expect(isValidPitchName("A-1")).toBe(true);
    expect(isValidPitchName("G#-1")).toBe(true);
    expect(isValidPitchName("Bb-2")).toBe(true);
  });

  it("returns true for high octaves", () => {
    expect(isValidPitchName("C8")).toBe(true);
    expect(isValidPitchName("G8")).toBe(true);
  });

  it("handles case insensitivity", () => {
    expect(isValidPitchName("c3")).toBe(true);
    expect(isValidPitchName("c#3")).toBe(true);
    expect(isValidPitchName("db3")).toBe(true);
    expect(isValidPitchName("DB3")).toBe(true);
  });

  it("returns false for invalid note letters", () => {
    expect(isValidPitchName("H3")).toBe(false);
    expect(isValidPitchName("X3")).toBe(false);
  });

  it("returns false for missing octave", () => {
    expect(isValidPitchName("C#")).toBe(false);
    expect(isValidPitchName("C")).toBe(false);
    expect(isValidPitchName("Db")).toBe(false);
  });

  it("returns false for invalid accidentals", () => {
    expect(isValidPitchName("C##3")).toBe(false);
    expect(isValidPitchName("Cbb3")).toBe(false);
    expect(isValidPitchName("Cx3")).toBe(false);
  });

  it("returns false for non-strings", () => {
    expect(isValidPitchName(60)).toBe(false);
    expect(isValidPitchName(null)).toBe(false);
    expect(isValidPitchName(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidPitchName("")).toBe(false);
  });
});

describe("isValidPitchClassName", () => {
  it("returns true for valid natural notes", () => {
    expect(isValidPitchClassName("C")).toBe(true);
    expect(isValidPitchClassName("D")).toBe(true);
    expect(isValidPitchClassName("E")).toBe(true);
    expect(isValidPitchClassName("F")).toBe(true);
    expect(isValidPitchClassName("G")).toBe(true);
    expect(isValidPitchClassName("A")).toBe(true);
    expect(isValidPitchClassName("B")).toBe(true);
  });

  it("returns true for sharps and flats", () => {
    expect(isValidPitchClassName("C#")).toBe(true);
    expect(isValidPitchClassName("Db")).toBe(true);
    expect(isValidPitchClassName("F#")).toBe(true);
    expect(isValidPitchClassName("Bb")).toBe(true);
  });

  it("handles case insensitivity", () => {
    expect(isValidPitchClassName("c")).toBe(true);
    expect(isValidPitchClassName("c#")).toBe(true);
    expect(isValidPitchClassName("db")).toBe(true);
    expect(isValidPitchClassName("DB")).toBe(true);
  });

  it("returns false for invalid inputs", () => {
    expect(isValidPitchClassName("H")).toBe(false);
    expect(isValidPitchClassName("C3")).toBe(false);
    expect(isValidPitchClassName("")).toBe(false);
    expect(isValidPitchClassName(null)).toBe(false);
    expect(isValidPitchClassName(60)).toBe(false);
  });
});

describe("pitchClassToNumber", () => {
  it("converts natural notes", () => {
    expect(pitchClassToNumber("C")).toBe(0);
    expect(pitchClassToNumber("D")).toBe(2);
    expect(pitchClassToNumber("E")).toBe(4);
    expect(pitchClassToNumber("F")).toBe(5);
    expect(pitchClassToNumber("G")).toBe(7);
    expect(pitchClassToNumber("A")).toBe(9);
    expect(pitchClassToNumber("B")).toBe(11);
  });

  it("converts sharps", () => {
    expect(pitchClassToNumber("C#")).toBe(1);
    expect(pitchClassToNumber("D#")).toBe(3);
    expect(pitchClassToNumber("F#")).toBe(6);
    expect(pitchClassToNumber("G#")).toBe(8);
    expect(pitchClassToNumber("A#")).toBe(10);
  });

  it("converts flats", () => {
    expect(pitchClassToNumber("Db")).toBe(1);
    expect(pitchClassToNumber("Eb")).toBe(3);
    expect(pitchClassToNumber("Gb")).toBe(6);
    expect(pitchClassToNumber("Ab")).toBe(8);
    expect(pitchClassToNumber("Bb")).toBe(10);
  });

  it("handles case insensitivity", () => {
    expect(pitchClassToNumber("c")).toBe(0);
    expect(pitchClassToNumber("c#")).toBe(1);
    expect(pitchClassToNumber("db")).toBe(1);
    expect(pitchClassToNumber("DB")).toBe(1);
  });

  it("throws for invalid pitch class names", () => {
    expect(() => pitchClassToNumber("H")).toThrow(/Invalid pitch class "H"/);
    expect(() => pitchClassToNumber("X")).toThrow(/Invalid pitch class "X"/);
    expect(() => pitchClassToNumber("C3")).toThrow(/Invalid pitch class "C3"/);
    expect(() => pitchClassToNumber("")).toThrow(/Invalid pitch class ""/);
  });

  it("throws for non-string inputs", () => {
    expect(() => pitchClassToNumber(null)).toThrow(/must be a string/);
    expect(() => pitchClassToNumber(undefined)).toThrow(/must be a string/);
    expect(() => pitchClassToNumber(60)).toThrow(/must be a string/);
  });
});

describe("numberToPitchClass", () => {
  it("converts all 12 pitch class numbers", () => {
    expect(numberToPitchClass(0)).toBe("C");
    expect(numberToPitchClass(1)).toBe("Db");
    expect(numberToPitchClass(2)).toBe("D");
    expect(numberToPitchClass(3)).toBe("Eb");
    expect(numberToPitchClass(4)).toBe("E");
    expect(numberToPitchClass(5)).toBe("F");
    expect(numberToPitchClass(6)).toBe("Gb");
    expect(numberToPitchClass(7)).toBe("G");
    expect(numberToPitchClass(8)).toBe("Ab");
    expect(numberToPitchClass(9)).toBe("A");
    expect(numberToPitchClass(10)).toBe("Bb");
    expect(numberToPitchClass(11)).toBe("B");
  });

  it("throws for out of range values", () => {
    expect(() => numberToPitchClass(-1)).toThrow(/Must be integer 0-11/);
    expect(() => numberToPitchClass(12)).toThrow(/Must be integer 0-11/);
    expect(() => numberToPitchClass(100)).toThrow(/Must be integer 0-11/);
  });

  it("throws for non-integers", () => {
    expect(() => numberToPitchClass(1.5)).toThrow(/Must be integer 0-11/);
    expect(() => numberToPitchClass(0.1)).toThrow(/Must be integer 0-11/);
  });

  it("throws for non-numbers", () => {
    expect(() => numberToPitchClass(null)).toThrow(
      /Invalid pitch class number/,
    );
    expect(() => numberToPitchClass(undefined)).toThrow(
      /Invalid pitch class number/,
    );
    expect(() => numberToPitchClass("0")).toThrow(/Invalid pitch class number/);
  });
});

describe("midiToPitchName", () => {
  it("converts all 12 pitch classes at octave 2 (MIDI 48-59)", () => {
    expect(midiToPitchName(48)).toBe("C2");
    expect(midiToPitchName(49)).toBe("Db2");
    expect(midiToPitchName(50)).toBe("D2");
    expect(midiToPitchName(51)).toBe("Eb2");
    expect(midiToPitchName(52)).toBe("E2");
    expect(midiToPitchName(53)).toBe("F2");
    expect(midiToPitchName(54)).toBe("Gb2");
    expect(midiToPitchName(55)).toBe("G2");
    expect(midiToPitchName(56)).toBe("Ab2");
    expect(midiToPitchName(57)).toBe("A2");
    expect(midiToPitchName(58)).toBe("Bb2");
    expect(midiToPitchName(59)).toBe("B2");
  });

  it("converts middle C (MIDI 60)", () => {
    expect(midiToPitchName(60)).toBe("C3");
  });

  it("handles edge cases: MIDI 0 and 127", () => {
    expect(midiToPitchName(0)).toBe("C-2");
    expect(midiToPitchName(127)).toBe("G8");
  });

  it("handles negative octaves", () => {
    expect(midiToPitchName(0)).toBe("C-2");
    expect(midiToPitchName(11)).toBe("B-2");
    expect(midiToPitchName(12)).toBe("C-1");
    expect(midiToPitchName(23)).toBe("B-1");
  });

  it("throws for invalid MIDI values", () => {
    expect(() => midiToPitchName(-1)).toThrow(/Invalid MIDI/);
    expect(() => midiToPitchName(128)).toThrow(/Invalid MIDI/);
    expect(() => midiToPitchName(null)).toThrow(/Invalid MIDI/);
    expect(() => midiToPitchName(undefined)).toThrow(/Invalid MIDI/);
    expect(() => midiToPitchName("60")).toThrow(/Invalid MIDI/);
    expect(() => midiToPitchName(60.5)).toThrow(/Invalid MIDI/);
  });
});

describe("pitchNameToMidi", () => {
  it("converts natural notes", () => {
    expect(pitchNameToMidi("C3")).toBe(60);
    expect(pitchNameToMidi("D3")).toBe(62);
    expect(pitchNameToMidi("E3")).toBe(64);
    expect(pitchNameToMidi("F3")).toBe(65);
    expect(pitchNameToMidi("G3")).toBe(67);
    expect(pitchNameToMidi("A3")).toBe(69);
    expect(pitchNameToMidi("B3")).toBe(71);
  });

  it("converts sharps", () => {
    expect(pitchNameToMidi("C#3")).toBe(61);
    expect(pitchNameToMidi("D#3")).toBe(63);
    expect(pitchNameToMidi("F#3")).toBe(66);
    expect(pitchNameToMidi("G#3")).toBe(68);
    expect(pitchNameToMidi("A#3")).toBe(70);
  });

  it("converts flats", () => {
    expect(pitchNameToMidi("Db3")).toBe(61);
    expect(pitchNameToMidi("Eb3")).toBe(63);
    expect(pitchNameToMidi("Gb3")).toBe(66);
    expect(pitchNameToMidi("Ab3")).toBe(68);
    expect(pitchNameToMidi("Bb3")).toBe(70);
  });

  it("handles case insensitivity", () => {
    expect(pitchNameToMidi("c3")).toBe(60);
    expect(pitchNameToMidi("C3")).toBe(60);
    expect(pitchNameToMidi("c#3")).toBe(61);
    expect(pitchNameToMidi("C#3")).toBe(61);
    expect(pitchNameToMidi("db3")).toBe(61);
    expect(pitchNameToMidi("DB3")).toBe(61);
  });

  it("converts negative octaves", () => {
    expect(pitchNameToMidi("C-2")).toBe(0);
    expect(pitchNameToMidi("A-1")).toBe(21);
    expect(pitchNameToMidi("G#-1")).toBe(20);
    expect(pitchNameToMidi("Bb-2")).toBe(10);
  });

  it("converts high octaves", () => {
    expect(pitchNameToMidi("C8")).toBe(120);
    expect(pitchNameToMidi("G8")).toBe(127);
  });

  it("converts middle C", () => {
    expect(pitchNameToMidi("C3")).toBe(60);
  });

  it("throws for invalid note letters", () => {
    expect(() => pitchNameToMidi("H3")).toThrow(/Invalid/);
    expect(() => pitchNameToMidi("X4")).toThrow(/Invalid/);
  });

  it("throws for missing octave", () => {
    expect(() => pitchNameToMidi("C#")).toThrow(/Invalid/);
    expect(() => pitchNameToMidi("C")).toThrow(/Invalid/);
  });

  it("throws for invalid formats", () => {
    expect(() => pitchNameToMidi("")).toThrow(/Invalid/);
    expect(() => pitchNameToMidi("C##3")).toThrow(/Invalid/);
  });

  it("throws for non-strings", () => {
    expect(() => pitchNameToMidi(null)).toThrow(/Invalid/);
    expect(() => pitchNameToMidi(undefined)).toThrow(/Invalid/);
    expect(() => pitchNameToMidi(60)).toThrow(/Invalid/);
  });

  it("throws for out-of-range results", () => {
    expect(() => pitchNameToMidi("C-3")).toThrow(/outside valid range/);
    expect(() => pitchNameToMidi("G#8")).toThrow(/outside valid range/);
  });
});

describe("round-trip conversions", () => {
  it("pitchNameToMidi(midiToPitchName(midi)) === midi for all valid MIDI values", () => {
    for (let midi = 0; midi <= 127; midi++) {
      const pitchName = midiToPitchName(midi);
      const result = pitchNameToMidi(pitchName);

      expect(result).toBe(midi);
    }
  });

  it("numberToPitchClass(pitchClassToNumber(name)) === name for canonical names", () => {
    for (const name of PITCH_CLASS_NAMES) {
      const num = pitchClassToNumber(name);
      const result = numberToPitchClass(num);

      expect(result).toBe(name);
    }
  });
});
