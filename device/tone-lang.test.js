// device/tone-lang.test.js
import { describe, it, expect } from "vitest";
import { parseToneLang, midiPitchToName } from "./tone-lang";

describe("parseToneLang", () => {
  it("returns empty array for empty input", () => {
    expect(parseToneLang("")).toEqual([]);
    expect(parseToneLang(null)).toEqual([]);
    expect(parseToneLang(undefined)).toEqual([]);
  });

  it("parses a sequence of single notes", () => {
    const result = parseToneLang("C3 D3 E3");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ pitch: 60, velocity: 70, start_time: 0, duration: 1 });
    expect(result[1]).toEqual({ pitch: 62, velocity: 70, start_time: 1, duration: 1 });
    expect(result[2]).toEqual({ pitch: 64, velocity: 70, start_time: 2, duration: 1 });
  });

  it("parses notes with durations", () => {
    const result = parseToneLang("C3/2 D3*2");
    expect(result[0].duration).toBe(0.5);
    expect(result[1].duration).toBe(2);
    expect(result[1].start_time).toBe(0.5);
  });

  it("parses notes with velocity", () => {
    const result = parseToneLang("C3v80 D3v127 E3v0");
    expect(result[0].velocity).toBe(80);
    expect(result[1].velocity).toBe(127);
    expect(result[2].velocity).toBe(0);
  });

  it("parses chords", () => {
    const result = parseToneLang("[C3 E3 G3]");
    expect(result).toHaveLength(3);
    result.forEach((note) => {
      expect(note.start_time).toBe(0);
      expect(note.duration).toBe(1);
      expect(note.velocity).toBe(70);
    });
  });

  it("parses chords with velocity and duration", () => {
    const result = parseToneLang("[C3 E3 G3]v90*2");
    expect(result).toHaveLength(3);
    result.forEach((note) => {
      expect(note.duration).toBe(2);
      expect(note.velocity).toBe(90);
    });
  });

  it("parses rests and adjusts time", () => {
    const result = parseToneLang("C3 R D3");
    expect(result).toHaveLength(2);
    expect(result[1].start_time).toBe(2); // C3 (1) + R (1)
  });

  it("handles mixed notes, chords, and rests", () => {
    const result = parseToneLang("C3 [D3 F3] R E3");
    expect(result).toHaveLength(4);
    expect(result[0].start_time).toBe(0); // C3
    expect(result[1].start_time).toBe(1); // D3 (chord)
    expect(result[2].start_time).toBe(1); // F3 (chord)
    expect(result[3].start_time).toBe(3); // E3 after rest
  });

  it("handles invalid velocity range by throwing", () => {
    expect(() => parseToneLang("C3v999")).toThrow();
    expect(() => parseToneLang("D3v-5")).toThrow();
  });

  it("handles invalid syntax by throwing", () => {
    expect(() => parseToneLang("invalid-input!!")).toThrow();
  });

  it("throws on invalid tokens", () => {
    expect(() => parseToneLang("C3 X9 E3")).toThrow();
  });

  it("parses notes with floating point durations", () => {
    const result = parseToneLang("C3*1.5 D3/1.5");
    expect(result[0].duration).toBeCloseTo(1.5);
    expect(result[1].duration).toBeCloseTo(1 / 1.5, 5);
    expect(result[1].start_time).toBeCloseTo(1.5);
  });

  it("parses multiple voices into a flattened note list", () => {
    const result = parseToneLang("C3 D3; G3 A3");

    expect(result.length).toBe(4);

    // Check pitches
    expect(result[0].pitch).toBe(60); // C3
    expect(result[1].pitch).toBe(62); // D3
    expect(result[2].pitch).toBe(67); // G3
    expect(result[3].pitch).toBe(69); // A3

    // Check timing
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(1);
    expect(result[2].start_time).toBe(0); // Second voice starts at 0
    expect(result[3].start_time).toBe(1);
  });

  it("handles complex multi-voice patterns", () => {
    const result = parseToneLang("C3*2 D3/2 E3/2; G3 A3*2 B3");

    expect(result.length).toBe(6);

    // Check timing
    expect(result[0].duration).toBe(2); // C3*2
    expect(result[1].start_time).toBe(2); // After C3*2
    expect(result[1].duration).toBe(0.5); // D3/2

    expect(result[3].start_time).toBe(0); // G3 starts at beginning of second voice
    expect(result[4].duration).toBe(2); // A3*2
  });

  it("parses notes with shorthand velocity", () => {
    const result = parseToneLang("C3> D3< E3>>");
    expect(result[0].velocity).toBe(90);
    expect(result[1].velocity).toBe(50);
    expect(result[2].velocity).toBe(110);
  });

  it("parses chords with shorthand velocity", () => {
    const result = parseToneLang("[C3 E3 G3]>");
    expect(result.length).toBe(3);
    result.forEach((note) => {
      expect(note.velocity).toBe(90);
    });
  });

  it("handles extreme shorthand velocity values", () => {
    const result = parseToneLang("C3>>> D3<<<");
    expect(result[0].velocity).toBe(127);
    expect(result[1].velocity).toBe(10);
  });

  it("parses notes with negative octaves", () => {
    const result = parseToneLang("C-2 C-1 C0 G8");
    expect(result).toHaveLength(4);
    expect(result[0].pitch).toBe(0); // C-2 is MIDI pitch 0
    expect(result[1].pitch).toBe(12); // C-1 is MIDI pitch 12
    expect(result[2].pitch).toBe(24); // C0 is MIDI pitch 24
    expect(result[3].pitch).toBe(127); // G8 is MIDI pitch 24
  });

  it("throws an error for pitches outside MIDI range", () => {
    expect(() => parseToneLang("C-3")).toThrow(/outside valid range/);
    expect(() => parseToneLang("Ab8")).toThrow(/outside valid range/);
    expect(() => parseToneLang("C9")).toThrow(/outside valid range/);
  });

  it("handles chords with individual note velocities", () => {
    const result = parseToneLang("[C3v90 E3v80 G3]v70");

    expect(result[0].velocity).toBe(90); // C3 overrides with v90
    expect(result[1].velocity).toBe(80); // E3 overrides with v80
    expect(result[2].velocity).toBe(70); // G3 uses chord's v70
  });

  it("handles chords with individual note durations", () => {
    const result = parseToneLang("[C3*2 E3 G3/2]");

    expect(result[0].duration).toBe(2); // C3 has *2
    expect(result[1].duration).toBe(1); // E3 uses default
    expect(result[2].duration).toBe(0.5); // G3 has /2
  });
});

describe("Default and Override Behavior", () => {
  // Rests
  it("applies default duration to rests when not specified", () => {
    const result = parseToneLang("R");
    expect(result).toEqual([]); // No notes, just time advancement
  });

  it("uses explicit duration for rests when specified", () => {
    const result = parseToneLang("C3 R*2 D3");
    expect(result[1].start_time).toBe(3); // C3(1) + R*2(2) = 3
  });

  // Notes
  it("applies default velocity and duration to notes", () => {
    const result = parseToneLang("C3");
    expect(result[0].velocity).toBe(70); // Default velocity
    expect(result[0].duration).toBe(1); // Default duration
  });

  it("uses explicit velocity and duration for notes", () => {
    const result = parseToneLang("C3v90*2");
    expect(result[0].velocity).toBe(90);
    expect(result[0].duration).toBe(2);
  });

  // Chords
  it("applies default velocity and duration to chords", () => {
    const result = parseToneLang("[C3 E3 G3]");

    result.forEach((note) => {
      expect(note.velocity).toBe(70); // Default velocity
      expect(note.duration).toBe(1); // Default duration
    });
  });

  it("applies chord-level velocity and duration to all notes", () => {
    const result = parseToneLang("[C3 E3 G3]v90*2");

    result.forEach((note) => {
      expect(note.velocity).toBe(90); // Chord velocity
      expect(note.duration).toBe(2); // Chord duration
    });
  });

  it("allows individual notes to override chord velocity", () => {
    const result = parseToneLang("[C3v100 E3 G3v50]v80");

    expect(result[0].velocity).toBe(100); // Note override
    expect(result[1].velocity).toBe(80); // Chord velocity
    expect(result[2].velocity).toBe(50); // Note override
  });

  it("allows individual notes to override chord duration", () => {
    const result = parseToneLang("[C3*3 E3 G3/2]*2");

    expect(result[0].duration).toBe(3); // Note override
    expect(result[1].duration).toBe(2); // Chord duration
    expect(result[2].duration).toBe(0.5); // Note override
  });

  it("handles complex overrides with both velocity and duration", () => {
    const result = parseToneLang("[C3v100*3 E3v90 G3*0.5]v80*2");

    expect(result[0].velocity).toBe(100); // Note velocity override
    expect(result[0].duration).toBe(3); // Note duration override

    expect(result[1].velocity).toBe(90); // Note velocity override
    expect(result[1].duration).toBe(2); // Chord duration

    expect(result[2].velocity).toBe(80); // Chord velocity
    expect(result[2].duration).toBe(0.5); // Note duration override
  });
});

describe("midiPitchToName", () => {
  it("converts valid midi pitch numbers to ToneLang-compatible strings", () => {
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

  it("handles invalid values", () => {
    expect(midiPitchToName(-1)).toBe("");
    expect(midiPitchToName(128)).toBe("");
    expect(midiPitchToName()).toBe("");
    expect(midiPitchToName("foo")).toBe("");
  });
});
