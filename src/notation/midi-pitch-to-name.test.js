import {
  midiPitchToName,
  nameToMidiPitch,
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "./midi-pitch-to-name.js";

describe("midiPitchToName", () => {
  it("converts valid midi pitch numbers to notation-syntax-compatible strings", () => {
    expect(midiPitchToName(0)).toBe("C-2"); // Lowest valid MIDI pitch
    expect(midiPitchToName(60)).toBe("C3"); // Middle C
    expect(midiPitchToName(127)).toBe("G8"); // Highest valid MIDI pitch
  });

  it("uses flats for all pitch classes", () => {
    expect(midiPitchToName(60)).toBe("C3");
    expect(midiPitchToName(61)).toBe("Db3");
    expect(midiPitchToName(62)).toBe("D3");
    expect(midiPitchToName(63)).toBe("Eb3");
    expect(midiPitchToName(64)).toBe("E3");
    expect(midiPitchToName(65)).toBe("F3");
    expect(midiPitchToName(66)).toBe("Gb3");
    expect(midiPitchToName(67)).toBe("G3");
    expect(midiPitchToName(68)).toBe("Ab3");
    expect(midiPitchToName(69)).toBe("A3");
    expect(midiPitchToName(70)).toBe("Bb3");
    expect(midiPitchToName(71)).toBe("B3");
  });

  it("handles different octaves", () => {
    expect(midiPitchToName(0)).toBe("C-2");
    expect(midiPitchToName(1)).toBe("Db-2");
    expect(midiPitchToName(12)).toBe("C-1");
    expect(midiPitchToName(23)).toBe("B-1");
    expect(midiPitchToName(24)).toBe("C0");
    expect(midiPitchToName(36)).toBe("C1");
    expect(midiPitchToName(48)).toBe("C2");
    expect(midiPitchToName(72)).toBe("C4");
    expect(midiPitchToName(84)).toBe("C5");
    expect(midiPitchToName(96)).toBe("C6");
    expect(midiPitchToName(108)).toBe("C7");
    expect(midiPitchToName(120)).toBe("C8");
  });
});

describe("intervalsToPitchClasses", () => {
  it("should convert C Major scale intervals to pitch classes", () => {
    const intervals = [0, 2, 4, 5, 7, 9, 11];
    const rootNote = 0; // C
    const result = intervalsToPitchClasses(intervals, rootNote);
    expect(result).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
  });

  it("should convert D Dorian scale intervals to pitch classes", () => {
    const intervals = [0, 2, 3, 5, 7, 9, 10];
    const rootNote = 2; // D
    const result = intervalsToPitchClasses(intervals, rootNote);
    expect(result).toEqual(["D", "E", "F", "G", "A", "B", "C"]);
  });

  it("should convert F# Minor scale intervals to pitch classes", () => {
    const intervals = [0, 2, 3, 5, 7, 8, 10];
    const rootNote = 6; // F#/Gb
    const result = intervalsToPitchClasses(intervals, rootNote);
    expect(result).toEqual(["Gb", "Ab", "A", "B", "Db", "D", "E"]);
  });

  it("should handle scales with chromatic intervals", () => {
    const intervals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const rootNote = 5; // F
    const result = intervalsToPitchClasses(intervals, rootNote);
    expect(result).toEqual([
      "F",
      "Gb",
      "G",
      "Ab",
      "A",
      "Bb",
      "B",
      "C",
      "Db",
      "D",
      "Eb",
      "E",
    ]);
  });

  it("should handle empty intervals array", () => {
    const intervals = [];
    const rootNote = 0; // C
    const result = intervalsToPitchClasses(intervals, rootNote);
    expect(result).toEqual([]);
  });

  it("should handle intervals that wrap around the octave", () => {
    const intervals = [0, 11, 13, 14]; // 13 = octave + 1, 14 = octave + 2
    const rootNote = 1; // Db
    const result = intervalsToPitchClasses(intervals, rootNote);
    expect(result).toEqual(["Db", "C", "D", "Eb"]);
  });

  it("should work with all 12 root notes", () => {
    const intervals = [0, 2, 4]; // Major triad
    for (let rootNote = 0; rootNote < 12; rootNote++) {
      const result = intervalsToPitchClasses(intervals, rootNote);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(PITCH_CLASS_NAMES[rootNote]);
      expect(result[1]).toBe(PITCH_CLASS_NAMES[(rootNote + 2) % 12]);
      expect(result[2]).toBe(PITCH_CLASS_NAMES[(rootNote + 4) % 12]);
    }
  });
});

describe("nameToMidiPitch", () => {
  it("converts note names to MIDI pitch numbers", () => {
    expect(nameToMidiPitch("C3")).toBe(60); // Middle C
    expect(nameToMidiPitch("A3")).toBe(69); // A440 (uses C3=60 convention)
    expect(nameToMidiPitch("C-2")).toBe(0); // Lowest MIDI note
    expect(nameToMidiPitch("G8")).toBe(127); // Highest MIDI note
  });

  it("handles sharps", () => {
    expect(nameToMidiPitch("C#3")).toBe(61);
    expect(nameToMidiPitch("F#3")).toBe(66);
    expect(nameToMidiPitch("G#2")).toBe(56);
  });

  it("handles flats", () => {
    expect(nameToMidiPitch("Db3")).toBe(61);
    expect(nameToMidiPitch("Bb3")).toBe(70);
    expect(nameToMidiPitch("Eb3")).toBe(63);
  });

  it("handles negative octaves", () => {
    expect(nameToMidiPitch("C-2")).toBe(0);
    expect(nameToMidiPitch("C-1")).toBe(12);
    expect(nameToMidiPitch("B-1")).toBe(23);
  });

  it("is case-insensitive for pitch class", () => {
    expect(nameToMidiPitch("c3")).toBe(60);
    expect(nameToMidiPitch("C3")).toBe(60);
  });

  it("throws on invalid input", () => {
    expect(() => nameToMidiPitch("")).toThrow("Invalid note name");
    expect(() => nameToMidiPitch("X3")).toThrow("Invalid note name format");
    expect(() => nameToMidiPitch("C")).toThrow("Invalid note name");
  });

  it("round-trips with midiPitchToName for flat notes", () => {
    for (let pitch = 0; pitch <= 127; pitch++) {
      const name = midiPitchToName(pitch);
      expect(nameToMidiPitch(name)).toBe(pitch);
    }
  });
});
