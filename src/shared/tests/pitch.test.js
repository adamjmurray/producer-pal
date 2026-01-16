import { describe, it, expect } from "vitest";
import {
  PITCH_CLASS_NAMES,
  PITCH_CLASS_VALUES,
  VALID_PITCH_CLASS_NAMES,
  isValidMidi,
  isValidNoteName,
  isValidPitchClassName,
  pitchClassToNumber,
  numberToPitchClass,
  midiToNoteName,
  noteNameToMidi,
} from "#src/shared/pitch.js";

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
    expect(isValidMidi()).toBe(false);
    expect(isValidMidi("60")).toBe(false);
    expect(isValidMidi(Number.NaN)).toBe(false);
  });
});

describe("isValidNoteName", () => {
  it("returns true for valid natural notes", () => {
    expect(isValidNoteName("C3")).toBe(true);
    expect(isValidNoteName("D4")).toBe(true);
    expect(isValidNoteName("E5")).toBe(true);
    expect(isValidNoteName("F2")).toBe(true);
    expect(isValidNoteName("G1")).toBe(true);
    expect(isValidNoteName("A0")).toBe(true);
    expect(isValidNoteName("B6")).toBe(true);
  });

  it("returns true for sharps", () => {
    expect(isValidNoteName("C#3")).toBe(true);
    expect(isValidNoteName("D#4")).toBe(true);
    expect(isValidNoteName("F#5")).toBe(true);
    expect(isValidNoteName("G#2")).toBe(true);
    expect(isValidNoteName("A#1")).toBe(true);
  });

  it("returns true for flats", () => {
    expect(isValidNoteName("Db3")).toBe(true);
    expect(isValidNoteName("Eb4")).toBe(true);
    expect(isValidNoteName("Gb5")).toBe(true);
    expect(isValidNoteName("Ab2")).toBe(true);
    expect(isValidNoteName("Bb1")).toBe(true);
  });

  it("returns true for negative octaves", () => {
    expect(isValidNoteName("C-2")).toBe(true);
    expect(isValidNoteName("A-1")).toBe(true);
    expect(isValidNoteName("G#-1")).toBe(true);
    expect(isValidNoteName("Bb-2")).toBe(true);
  });

  it("returns true for high octaves", () => {
    expect(isValidNoteName("C8")).toBe(true);
    expect(isValidNoteName("G8")).toBe(true);
  });

  it("handles case insensitivity", () => {
    expect(isValidNoteName("c3")).toBe(true);
    expect(isValidNoteName("c#3")).toBe(true);
    expect(isValidNoteName("db3")).toBe(true);
    expect(isValidNoteName("DB3")).toBe(true);
  });

  it("returns false for invalid note letters", () => {
    expect(isValidNoteName("H3")).toBe(false);
    expect(isValidNoteName("X3")).toBe(false);
  });

  it("returns false for missing octave", () => {
    expect(isValidNoteName("C#")).toBe(false);
    expect(isValidNoteName("C")).toBe(false);
    expect(isValidNoteName("Db")).toBe(false);
  });

  it("returns false for invalid accidentals", () => {
    expect(isValidNoteName("C##3")).toBe(false);
    expect(isValidNoteName("Cbb3")).toBe(false);
    expect(isValidNoteName("Cx3")).toBe(false);
  });

  it("returns false for non-strings", () => {
    expect(isValidNoteName(60)).toBe(false);
    expect(isValidNoteName(null)).toBe(false);
    expect(isValidNoteName()).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidNoteName("")).toBe(false);
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

  it("returns null for invalid pitch class names", () => {
    expect(pitchClassToNumber("H")).toBe(null);
    expect(pitchClassToNumber("X")).toBe(null);
    expect(pitchClassToNumber("C3")).toBe(null);
    expect(pitchClassToNumber("")).toBe(null);
  });

  it("returns null for non-string inputs", () => {
    expect(pitchClassToNumber(null)).toBe(null);
    expect(pitchClassToNumber()).toBe(null);
    expect(pitchClassToNumber(60)).toBe(null);
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

  it("returns null for out of range values", () => {
    expect(numberToPitchClass(-1)).toBe(null);
    expect(numberToPitchClass(12)).toBe(null);
    expect(numberToPitchClass(100)).toBe(null);
  });

  it("returns null for non-integers", () => {
    expect(numberToPitchClass(1.5)).toBe(null);
    expect(numberToPitchClass(0.1)).toBe(null);
  });

  it("returns null for non-numbers", () => {
    expect(numberToPitchClass(null)).toBe(null);
    expect(numberToPitchClass()).toBe(null);
    expect(numberToPitchClass("0")).toBe(null);
  });
});

describe("midiToNoteName", () => {
  it("converts all 12 pitch classes at octave 2 (MIDI 48-59)", () => {
    expect(midiToNoteName(48)).toBe("C2");
    expect(midiToNoteName(49)).toBe("Db2");
    expect(midiToNoteName(50)).toBe("D2");
    expect(midiToNoteName(51)).toBe("Eb2");
    expect(midiToNoteName(52)).toBe("E2");
    expect(midiToNoteName(53)).toBe("F2");
    expect(midiToNoteName(54)).toBe("Gb2");
    expect(midiToNoteName(55)).toBe("G2");
    expect(midiToNoteName(56)).toBe("Ab2");
    expect(midiToNoteName(57)).toBe("A2");
    expect(midiToNoteName(58)).toBe("Bb2");
    expect(midiToNoteName(59)).toBe("B2");
  });

  it("converts middle C (MIDI 60)", () => {
    expect(midiToNoteName(60)).toBe("C3");
  });

  it("handles edge cases: MIDI 0 and 127", () => {
    expect(midiToNoteName(0)).toBe("C-2");
    expect(midiToNoteName(127)).toBe("G8");
  });

  it("handles negative octaves", () => {
    expect(midiToNoteName(0)).toBe("C-2");
    expect(midiToNoteName(11)).toBe("B-2");
    expect(midiToNoteName(12)).toBe("C-1");
    expect(midiToNoteName(23)).toBe("B-1");
  });

  it("returns null for invalid MIDI values", () => {
    expect(midiToNoteName(-1)).toBe(null);
    expect(midiToNoteName(128)).toBe(null);
    expect(midiToNoteName(null)).toBe(null);
    expect(midiToNoteName()).toBe(null);
    expect(midiToNoteName("60")).toBe(null);
    expect(midiToNoteName(60.5)).toBe(null);
  });
});

describe("noteNameToMidi", () => {
  it("converts natural notes", () => {
    expect(noteNameToMidi("C3")).toBe(60);
    expect(noteNameToMidi("D3")).toBe(62);
    expect(noteNameToMidi("E3")).toBe(64);
    expect(noteNameToMidi("F3")).toBe(65);
    expect(noteNameToMidi("G3")).toBe(67);
    expect(noteNameToMidi("A3")).toBe(69);
    expect(noteNameToMidi("B3")).toBe(71);
  });

  it("converts sharps", () => {
    expect(noteNameToMidi("C#3")).toBe(61);
    expect(noteNameToMidi("D#3")).toBe(63);
    expect(noteNameToMidi("F#3")).toBe(66);
    expect(noteNameToMidi("G#3")).toBe(68);
    expect(noteNameToMidi("A#3")).toBe(70);
  });

  it("converts flats", () => {
    expect(noteNameToMidi("Db3")).toBe(61);
    expect(noteNameToMidi("Eb3")).toBe(63);
    expect(noteNameToMidi("Gb3")).toBe(66);
    expect(noteNameToMidi("Ab3")).toBe(68);
    expect(noteNameToMidi("Bb3")).toBe(70);
  });

  it("handles case insensitivity", () => {
    expect(noteNameToMidi("c3")).toBe(60);
    expect(noteNameToMidi("C3")).toBe(60);
    expect(noteNameToMidi("c#3")).toBe(61);
    expect(noteNameToMidi("C#3")).toBe(61);
    expect(noteNameToMidi("db3")).toBe(61);
    expect(noteNameToMidi("DB3")).toBe(61);
  });

  it("converts negative octaves", () => {
    expect(noteNameToMidi("C-2")).toBe(0);
    expect(noteNameToMidi("A-1")).toBe(21);
    expect(noteNameToMidi("G#-1")).toBe(20);
    expect(noteNameToMidi("Bb-2")).toBe(10);
  });

  it("converts high octaves", () => {
    expect(noteNameToMidi("C8")).toBe(120);
    expect(noteNameToMidi("G8")).toBe(127);
  });

  it("converts middle C", () => {
    expect(noteNameToMidi("C3")).toBe(60);
  });

  it("returns null for invalid note letters", () => {
    expect(noteNameToMidi("H3")).toBe(null);
    expect(noteNameToMidi("X4")).toBe(null);
  });

  it("returns null for missing octave", () => {
    expect(noteNameToMidi("C#")).toBe(null);
    expect(noteNameToMidi("C")).toBe(null);
  });

  it("returns null for invalid formats", () => {
    expect(noteNameToMidi("")).toBe(null);
    expect(noteNameToMidi("C##3")).toBe(null);
  });

  it("returns null for non-strings", () => {
    expect(noteNameToMidi(null)).toBe(null);
    expect(noteNameToMidi()).toBe(null);
    expect(noteNameToMidi(60)).toBe(null);
  });

  it("returns null for out-of-range results", () => {
    expect(noteNameToMidi("C-3")).toBe(null);
    expect(noteNameToMidi("G#8")).toBe(null);
  });
});

describe("round-trip conversions", () => {
  it("noteNameToMidi(midiToNoteName(midi)) === midi for all valid MIDI values", () => {
    for (let midi = 0; midi <= 127; midi++) {
      const noteName = midiToNoteName(midi);
      const result = noteNameToMidi(noteName);

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
