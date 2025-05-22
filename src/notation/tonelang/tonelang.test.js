// src/notation/tonelang/tonelang.test.js
import { describe, expect, it } from "vitest";
import { parseNotation } from "./tonelang";

describe("parseToneLang", () => {
  it("returns empty array for empty input", () => {
    expect(parseNotation("")).toEqual([]);
    expect(parseNotation(null)).toEqual([]);
    expect(parseNotation(undefined)).toEqual([]);
  });

  it("parses a sequence of single notes", () => {
    const result = parseNotation("C3 D3 E3");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ pitch: 60, velocity: 70, start_time: 0, duration: 1 });
    expect(result[1]).toEqual({ pitch: 62, velocity: 70, start_time: 1, duration: 1 });
    expect(result[2]).toEqual({ pitch: 64, velocity: 70, start_time: 2, duration: 1 });
  });

  it("parses notes with the new duration syntax", () => {
    const result = parseNotation("C3n2 D3n0.5");
    expect(result[0].duration).toBe(2);
    expect(result[1].duration).toBe(0.5);
    expect(result[1].start_time).toBe(2); // C3n2 + start at 0
  });

  it("parses notes with velocity", () => {
    const result = parseNotation("C3v80 D3v127 E3v0");
    expect(result[0].velocity).toBe(80);
    expect(result[1].velocity).toBe(127);
    expect(result[2].velocity).toBe(0);
  });

  it("parses chords", () => {
    const result = parseNotation("[C3 E3 G3]");
    expect(result).toHaveLength(3);
    result.forEach((note) => {
      expect(note.start_time).toBe(0);
      expect(note.duration).toBe(1);
      expect(note.velocity).toBe(70);
    });
  });

  it("parses rests and adjusts time", () => {
    const result = parseNotation("C3 R D3");
    expect(result).toHaveLength(2);
    expect(result[1].start_time).toBe(2); // C3 (1) + R (1)
  });

  it("handles mixed notes, chords, and rests", () => {
    const result = parseNotation("C3 [D3 F3] R E3");
    expect(result).toHaveLength(4);
    expect(result[0].start_time).toBe(0); // C3
    expect(result[1].start_time).toBe(1); // D3 (chord)
    expect(result[2].start_time).toBe(1); // F3 (chord)
    expect(result[3].start_time).toBe(3); // E3 after rest
  });

  it("handles invalid velocity range by throwing", () => {
    expect(() => parseNotation("C3v999")).toThrow();
    expect(() => parseNotation("D3v-5")).toThrow();
  });

  it("handles invalid syntax by throwing", () => {
    expect(() => parseNotation("invalid-input!!")).toThrow();
  });

  it("throws on invalid tokens", () => {
    expect(() => parseNotation("C3 X9 E3")).toThrow();
  });

  it("parses multiple voices into a flattened note list", () => {
    const result = parseNotation("C3 D3; G3 A3");

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
    const result = parseNotation("C3n2 D3n.5 E3n.5; G3 A3n2 B3");

    expect(result.length).toBe(6);

    // Check timing
    expect(result[0].duration).toBe(2); // C3*2
    expect(result[1].start_time).toBe(2); // After C3*2
    expect(result[1].duration).toBe(0.5); // D3/2

    expect(result[3].start_time).toBe(0); // G3 starts at beginning of second voice
    expect(result[4].duration).toBe(2); // A3*2
  });

  it("parses notes with negative octaves", () => {
    const result = parseNotation("C-2 C-1 C0 G8");
    expect(result).toHaveLength(4);
    expect(result[0].pitch).toBe(0); // C-2 is MIDI pitch 0
    expect(result[1].pitch).toBe(12); // C-1 is MIDI pitch 12
    expect(result[2].pitch).toBe(24); // C0 is MIDI pitch 24
    expect(result[3].pitch).toBe(127); // G8 is MIDI pitch 24
  });

  it("throws an error for pitches outside MIDI range", () => {
    expect(() => parseNotation("C-3")).toThrow(/outside valid range/);
    expect(() => parseNotation("Ab8")).toThrow(/outside valid range/);
    expect(() => parseNotation("C9")).toThrow(/outside valid range/);
  });

  it("handles chords with individual note velocities", () => {
    const result = parseNotation("[C3v90 E3v80 G3]v70");

    expect(result[0].velocity).toBe(90); // C3 overrides with v90
    expect(result[1].velocity).toBe(80); // E3 overrides with v80
    expect(result[2].velocity).toBe(70); // G3 uses chord's v70
  });

  it("handles chords with individual note durations", () => {
    const result = parseNotation("[C3n2 E3 G3n0.5]");

    expect(result[0].duration).toBe(2); // C3 has n2
    expect(result[1].duration).toBe(1); // E3 uses default
    expect(result[2].duration).toBe(0.5); // G3 has n0.5
  });

  it("parses rests and adjusts time", () => {
    const result = parseNotation("C3 R1 D3");
    expect(result).toHaveLength(2);
    expect(result[1].start_time).toBe(2); // C3 (1) + R (1)
  });

  it("handles rests with various durations", () => {
    const result = parseNotation("C3 R2 D3");
    expect(result).toHaveLength(2);
    expect(result[1].start_time).toBe(3); // C3 (1) + R2 (2)

    const result2 = parseNotation("C3 R.25 D3");
    expect(result2).toHaveLength(2);
    expect(result2[1].start_time).toBe(1.25); // C3 (1) + R.25 (0.25)
  });
});

describe("Default and Override Behavior", () => {
  // Rests
  it("applies default duration to rests when not specified", () => {
    const result = parseNotation("R");
    expect(result).toEqual([]); // No notes, just time advancement
  });

  // Notes
  it("applies default velocity and duration to notes", () => {
    const result = parseNotation("C3");
    expect(result[0].velocity).toBe(70); // Default velocity
    expect(result[0].duration).toBe(1); // Default duration
  });

  it("uses explicit velocity and duration for notes", () => {
    const result = parseNotation("C3v90n2");
    expect(result[0].velocity).toBe(90);
    expect(result[0].duration).toBe(2);
  });

  // Chords
  it("applies default velocity and duration to chords", () => {
    const result = parseNotation("[C3 E3 G3]");

    result.forEach((note) => {
      expect(note.velocity).toBe(70); // Default velocity
      expect(note.duration).toBe(1); // Default duration
    });
  });

  it("applies chord-level velocity and duration to all notes", () => {
    const result = parseNotation("[C3 E3 G3]v90n2");

    result.forEach((note) => {
      expect(note.velocity).toBe(90); // Chord velocity
      expect(note.duration).toBe(2); // Chord duration
    });
  });

  it("allows individual notes to override chord velocity", () => {
    const result = parseNotation("[C3v100 E3 G3v50]v80");

    expect(result[0].velocity).toBe(100); // Note override
    expect(result[1].velocity).toBe(80); // Chord velocity
    expect(result[2].velocity).toBe(50); // Note override
  });

  it("allows individual notes to override chord duration", () => {
    const result = parseNotation("[C3n3 E3 G3n0.5]n2");

    expect(result[0].duration).toBe(3); // Note override
    expect(result[1].duration).toBe(2); // Chord duration
    expect(result[2].duration).toBe(0.5); // Note override
  });

  it("handles complex overrides with both velocity and duration", () => {
    const result = parseNotation("[C3v100n3 E3v90 G3n0.5]v80n2");

    expect(result[0].velocity).toBe(100); // Note velocity override
    expect(result[0].duration).toBe(3); // Note duration override

    expect(result[1].velocity).toBe(90); // Note velocity override
    expect(result[1].duration).toBe(2); // Chord duration

    expect(result[2].velocity).toBe(80); // Chord velocity
    expect(result[2].duration).toBe(0.5); // Note duration override
  });

  it("handles timeUntilNext modifier for overlapping notes", () => {
    const result = parseNotation("C4n4t2 D4n4t2 E4n4");
    expect(result).toHaveLength(3);

    expect(result[0].start_time).toBe(0);
    expect(result[0].duration).toBe(4);

    expect(result[1].start_time).toBe(2); // Starts 2 beats after C4
    expect(result[1].duration).toBe(4);

    expect(result[2].start_time).toBe(4); // Starts 2 beats after D4
    expect(result[2].duration).toBe(4);
  });

  it("handles timeUntilNext for staccato articulation", () => {
    const result = parseNotation("C4n0.5t1 D4n0.5t1 E4n0.5t1");

    expect(result[0].start_time).toBe(0);
    expect(result[0].duration).toBe(0.5);

    expect(result[1].start_time).toBe(1);
    expect(result[1].duration).toBe(0.5);

    expect(result[2].start_time).toBe(2);
    expect(result[2].duration).toBe(0.5);
  });

  it("handles timeUntilNext with chords", () => {
    const result = parseNotation("[C4 E4 G4]n2t3 [D4 F4 A4]n2");

    expect(result[0].start_time).toBe(0);
    expect(result[3].start_time).toBe(3); // First note of second chord starts 3 beats after
  });
});

describe("Repetition", () => {
  it("handles basic repetition", () => {
    const result = parseNotation("(C3 D3)*2");
    expect(result).toHaveLength(4);

    expect(result[0].pitch).toBe(60); // C3
    expect(result[1].pitch).toBe(62); // D3
    expect(result[2].pitch).toBe(60); // C3
    expect(result[3].pitch).toBe(62); // D3

    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(1);
    expect(result[2].start_time).toBe(2);
    expect(result[3].start_time).toBe(3);
  });

  it("handles nested repetition", () => {
    const result = parseNotation("((C3 D3)*2 E3)*3");
    expect(result).toHaveLength(15);

    // First group: C3 D3 C3 D3 E3
    expect(result[0].pitch).toBe(60);
    expect(result[4].pitch).toBe(64); // E3

    // Second group starts at index 5
    expect(result[5].pitch).toBe(60);

    // Third group starts at index 10
    expect(result[10].pitch).toBe(60);

    // Check timing
    expect(result[0].start_time).toBe(0); // First C3
    expect(result[4].start_time).toBe(4); // First E3
    expect(result[5].start_time).toBe(5); // Second group C3
  });

  it("handles repetition with mixed element types", () => {
    const result = parseNotation("(C3 [E3 G3] R)*2");
    expect(result).toHaveLength(6);

    // Check timing with rest
    expect(result[0].start_time).toBe(0); // C3
    expect(result[1].start_time).toBe(1); // E3 (chord)
    expect(result[3].start_time).toBe(3); // C3 (after rest)
  });

  it("handles parentheses without repetition", () => {
    const result = parseNotation("(C3 D3)");
    expect(result).toHaveLength(2);
    expect(result[0].pitch).toBe(60); // C3
    expect(result[1].pitch).toBe(62); // D3
  });

  it("handles repetition on a single note", () => {
    const result = parseNotation("C4*2 D4");
    expect(result).toHaveLength(3);

    expect(result[0].pitch).toBe(72); // C4
    expect(result[1].pitch).toBe(72); // C4 repeated
    expect(result[2].pitch).toBe(74); // D4

    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(1);
    expect(result[2].start_time).toBe(2);
  });

  it("handles repetition on a note with modifiers", () => {
    const result = parseNotation("C4v80n2*3 D4");
    expect(result).toHaveLength(4);

    // Check all three C4 instances
    for (let i = 0; i < 3; i++) {
      expect(result[i].pitch).toBe(72); // C4
      expect(result[i].velocity).toBe(80);
      expect(result[i].duration).toBe(2);
      expect(result[i].start_time).toBe(i * 2); // 0, 2, 4
    }

    expect(result[3].pitch).toBe(74); // D4
    expect(result[3].start_time).toBe(6); // After 3 * C4n2
  });

  it("handles repetition on a chord", () => {
    const result = parseNotation("[C4 E4 G4]*2 D4");
    expect(result).toHaveLength(7); // 3 notes * 2 + 1 note

    // First chord
    expect(result[0].pitch).toBe(72); // C4
    expect(result[1].pitch).toBe(76); // E4
    expect(result[2].pitch).toBe(79); // G4

    // Second chord (repeated)
    expect(result[3].pitch).toBe(72); // C4
    expect(result[4].pitch).toBe(76); // E4
    expect(result[5].pitch).toBe(79); // G4

    // Final note
    expect(result[6].pitch).toBe(74); // D4
  });

  it("handles repetition on a chord with modifiers", () => {
    const result = parseNotation("[C4 E4 G4]v80n2*3 D4");
    expect(result).toHaveLength(10); // 3 notes * 3 repetitions + 1 final note

    // Check all three chord instances
    for (let i = 0; i < 3; i++) {
      const offset = i * 3; // Each chord has 3 notes

      // Check each note in the chord
      expect(result[offset].pitch).toBe(72); // C4
      expect(result[offset + 1].pitch).toBe(76); // E4
      expect(result[offset + 2].pitch).toBe(79); // G4

      // Check modifiers apply to all notes
      for (let j = 0; j < 3; j++) {
        expect(result[offset + j].velocity).toBe(80);
        expect(result[offset + j].duration).toBe(2);
        expect(result[offset + j].start_time).toBe(i * 2); // 0, 2, 4
      }
    }

    // Check final note
    expect(result[9].pitch).toBe(74); // D4
    expect(result[9].start_time).toBe(6); // After 3 chords with duration 2
  });

  it("handles repetition on rests", () => {
    const result = parseNotation("C4 R*3 R2*2 D4");
    expect(result).toHaveLength(2);

    expect(result[0].pitch).toBe(72); // C4
    expect(result[0].start_time).toBe(0);

    expect(result[1].pitch).toBe(74); // D4
    expect(result[1].start_time).toBe(8); // After C4 (1) + R1*3 (3) + R2*2 (4)
  });

  it("handles repetition on rests with duration", () => {
    const result = parseNotation("C4 R0.5*4 D4");
    expect(result).toHaveLength(2);

    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(3); // After C4 (1) + R0.5*4 (2)
  });

  it("handles repetition of elements within a sequence repetition", () => {
    const result = parseNotation("(C4*2 D4)*3");
    expect(result).toHaveLength(9);

    // Check the pattern repeats properly
    for (let i = 0; i < 3; i++) {
      const offset = i * 3;
      expect(result[offset].pitch).toBe(72); // C4
      expect(result[offset + 1].pitch).toBe(72); // C4 repeated
      expect(result[offset + 2].pitch).toBe(74); // D4
    }

    // Check start times
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(1);
    expect(result[2].start_time).toBe(2);
    expect(result[3].start_time).toBe(3); // Start of second group
    expect(result[6].start_time).toBe(6); // Start of third group
  });

  it("doesn't allow negative repetitions", () => {
    expect(() => parseNotation("C4*-2")).toThrow(/syntax error.*Unexpected '-'/);
  });
});

describe("Grammar Updates", () => {
  it("handles groupings with modifiers", () => {
    const result = parseNotation("(C3 D3)v90");

    expect(result).toHaveLength(2);
    expect(result[0].velocity).toBe(90);
    expect(result[1].velocity).toBe(90);
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(1);
  });

  it("handles modifiers in different orders", () => {
    const resultVNT = parseNotation("C3v80n2t3");
    const resultNVT = parseNotation("C3n2v80t3");
    const resultTNV = parseNotation("C3t3n2v80");

    [resultVNT, resultNVT, resultTNV].forEach((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].velocity).toBe(80);
      expect(result[0].duration).toBe(2);
    });
  });

  it("throws on duplicate modifiers", () => {
    expect(() => parseNotation("C3v80v90")).toThrow(/Duplicate modifier/);
    expect(() => parseNotation("C3n2n3")).toThrow(/Duplicate modifier/);
    expect(() => parseNotation("C3t1t2")).toThrow(/Duplicate modifier/);
  });

  it("handles complex combinations of groupings, modifiers, and repetition", () => {
    const result = parseNotation("(C3 [D3 F3]v90)*2");

    expect(result).toHaveLength(6);

    // Check start times
    expect(result[0].start_time).toBe(0); // First C3
    expect(result[1].start_time).toBe(1); // First D3
    expect(result[2].start_time).toBe(1); // First F3
    expect(result[3].start_time).toBe(2); // Second C3
    expect(result[4].start_time).toBe(3); // Second D3
    expect(result[5].start_time).toBe(3); // Second F3

    // Check velocities
    expect(result[0].velocity).toBe(70); // Default
    expect(result[1].velocity).toBe(90); // From chord modifier
    expect(result[2].velocity).toBe(90); // From chord modifier
  });

  it("applies velocity modifiers from groupings to contained notes", () => {
    const result = parseNotation("([C3 E3] D3v50)v90");

    expect(result).toHaveLength(3);
    expect(result[0].velocity).toBe(90); // C3 from grouping
    expect(result[1].velocity).toBe(90); // E3 from grouping
    expect(result[2].velocity).toBe(50); // D3 keeps its own velocity
  });

  it("advances time cursor by maximum note duration in a chord when t is not specified", () => {
    const result = parseNotation("[C3n1 D3n2 E3n3]");

    // All notes start at the same time
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(0);
    expect(result[2].start_time).toBe(0);

    // Notes have their respective durations
    expect(result[0].duration).toBe(1);
    expect(result[1].duration).toBe(2);
    expect(result[2].duration).toBe(3);

    // Check that the next element starts after the longest note
    const result2 = parseNotation("[C3n1 D3n2 E3n3] G3");
    expect(result2[3].start_time).toBe(3); // After the longest note (E3n3)
  });

  it("uses chord t value to override child note durations for timing", () => {
    const result = parseNotation("[C3n1 D3n2 E3n3]t4 G3");

    // All notes start at the same time
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(0);
    expect(result[2].start_time).toBe(0);

    // Notes have their respective durations
    expect(result[0].duration).toBe(1);
    expect(result[1].duration).toBe(2);
    expect(result[2].duration).toBe(3);

    // G3 starts after t4, not after the longest note
    expect(result[3].start_time).toBe(4);
  });

  it("ignores t on a grouping for timing purposes", () => {
    const result = parseNotation("(C3 D3)t5 G3");

    // C3 and D3 are processed normally
    expect(result[0].start_time).toBe(0);
    expect(result[1].start_time).toBe(5);

    // G3 starts after the natural duration of the grouping, ignoring t5
    expect(result[2].start_time).toBe(10);
  });

  it("handles complex combinations of chords, groupings, and modifiers", () => {
    const result = parseNotation("(C3 [D3n1 E3n2 F3n3]) G3");

    // C3 starts at the beginning of the grouping
    expect(result[0].start_time).toBe(0);

    // D3, E3, F3 form a chord that starts after C3
    expect(result[1].start_time).toBe(1);
    expect(result[2].start_time).toBe(1);
    expect(result[3].start_time).toBe(1);

    // The chord advances by the maximum note duration (F3n3)
    // Total grouping duration: 1 (for C3) + 3 (for the chord) = 4
    expect(result[4].start_time).toBe(4);
  });

  it("handles grouping modifiers with repetition", () => {
    const result = parseNotation("(C3 D3)v90*2 G3");

    // All notes in the grouping inherit velocity 90
    expect(result[0].velocity).toBe(90);
    expect(result[1].velocity).toBe(90);
    expect(result[2].velocity).toBe(90);
    expect(result[3].velocity).toBe(90);

    // G3 has default velocity
    expect(result[4].velocity).toBe(70);

    // Timing: 2 beats for first group + 2 beats for second group
    expect(result[4].start_time).toBe(4);
  });
});
