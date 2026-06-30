// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import {
  applyScale,
  chooseOctave,
  getChordQuality,
  parseScale,
} from "#src/notation/stark/stark-interpreter-helpers.ts";

describe("stark-interpreter", () => {
  describe("drums mode", () => {
    it("parses a basic kick pattern", () => {
      const result = interpretNotation("kick: X x X x");

      expect(result).toHaveLength(4);
      expect(result[0]?.pitch).toBe(36); // C1
      expect(result[0]?.start_time).toBe(0);
      expect(result[0]?.duration).toBe(1.0);
      expect(result[0]?.velocity).toBeGreaterThanOrEqual(100);
      expect(result[0]?.velocity).toBeLessThanOrEqual(110);
    });

    it("parses multiple drum lines", () => {
      const result = interpretNotation("kick: X . X .\nsnare: . X . X");

      expect(result).toHaveLength(4);
      const kicks = result.filter((n) => n.pitch === 36);

      expect(kicks.map((n) => n.start_time)).toStrictEqual([0, 2]);
      const snares = result.filter((n) => n.pitch === 38);

      expect(snares.map((n) => n.start_time)).toStrictEqual([1, 3]);
    });

    it("handles 16th notes", () => {
      const result = interpretNotation("hihat: xxxx");

      expect(result).toHaveLength(4);
      expect(result.map((n) => n.start_time)).toStrictEqual([
        0, 0.25, 0.5, 0.75,
      ]);
      expect(result[0]?.duration).toBe(0.25);
    });

    it("handles bar markers", () => {
      const result = interpretNotation("kick: X x / X x");

      expect(result.map((n) => n.start_time)).toStrictEqual([0, 1, 4, 5]);
    });

    it("handles different velocities", () => {
      const result = interpretNotation("kick: X x ^");

      expect(result[0]?.velocity).toBeGreaterThanOrEqual(100);
      expect(result[0]?.velocity).toBeLessThanOrEqual(110);
      expect(result[1]?.velocity).toBeGreaterThanOrEqual(60);
      expect(result[1]?.velocity).toBeLessThanOrEqual(80);
      expect(result[2]?.velocity).toBeGreaterThanOrEqual(115);
      expect(result[2]?.velocity).toBeLessThanOrEqual(127);
    });

    it("treats sustain as a rest for drums", () => {
      const result = interpretNotation("kick: X - X");

      expect(result).toHaveLength(2);
      expect(result.map((n) => n.start_time)).toStrictEqual([0, 2]);
    });

    it("maps drum aliases", () => {
      expect(interpretNotation("bd: X")[0]?.pitch).toBe(36);
      expect(interpretNotation("sd: X")[0]?.pitch).toBe(38);
      expect(interpretNotation("oh: X")[0]?.pitch).toBe(46);
      expect(interpretNotation("rs: X")[0]?.pitch).toBe(37);
    });
  });

  describe("bass mode", () => {
    it("parses a basic bass line in C major", () => {
      const result = interpretNotation("bass: C D E F", { scale: "C Major" });

      expect(result.map((n) => n.pitch)).toStrictEqual([36, 38, 40, 41]);
    });

    it("applies scale accidentals", () => {
      const result = interpretNotation("bass: A B D E", { scale: "Ab Major" });

      // In Ab Major: A→Ab(32), B→Bb(34), D→Db(37), E→Eb(39)
      expect(result.map((n) => n.pitch)).toStrictEqual([32, 34, 37, 39]);
    });

    it("chooses the closest octave", () => {
      const result = interpretNotation("bass: B C", { scale: "C Major" });

      expect(result.map((n) => n.pitch)).toStrictEqual([35, 36]); // B2 → C3
    });

    it("handles bar markers", () => {
      const result = interpretNotation("bass: C / E", { scale: "C Major" });

      expect(result.map((n) => n.start_time)).toStrictEqual([0, 4]);
    });

    it("handles sustain by extending the previous note", () => {
      const result = interpretNotation("bass: C - - E", { scale: "C Major" });

      expect(result).toHaveLength(2);
      expect(result[0]?.duration).toBe(3.0);
      expect(result[1]?.start_time).toBe(3);
    });

    it("ignores a leading sustain with no note to extend", () => {
      const result = interpretNotation("bass: - C", { scale: "C Major" });

      expect(result).toHaveLength(1);
      expect(result[0]?.start_time).toBe(1.0); // leading quarter sustain advances time
    });

    it("resets sustain target across bar markers", () => {
      // The sustain after the bar marker has nothing to extend, so C keeps its
      // quarter-note duration.
      const result = interpretNotation("bass: C / - E", { scale: "C Major" });

      expect(result).toHaveLength(2);
      expect(result[0]?.duration).toBe(1.0);
    });

    it("handles rests", () => {
      const result = interpretNotation("bass: C . E", { scale: "C Major" });

      expect(result.map((n) => n.start_time)).toStrictEqual([0, 2]);
    });

    it("handles dynamics", () => {
      const result = interpretNotation("bass: C c", { scale: "C Major" });

      expect(result[0]?.velocity).toBeGreaterThanOrEqual(100);
      expect(result[1]?.velocity).toBeLessThanOrEqual(80);
    });

    it("handles 16th notes", () => {
      const result = interpretNotation("bass: CDEF", { scale: "C Major" });

      expect(result.map((n) => n.start_time)).toStrictEqual([
        0, 0.25, 0.5, 0.75,
      ]);
      expect(result[0]?.duration).toBe(0.25);
    });
  });

  describe("melody mode", () => {
    it("parses a basic melody in C major", () => {
      const result = interpretNotation("melody: E G A", { scale: "C Major" });

      expect(result.map((n) => n.pitch)).toStrictEqual([64, 67, 69]);
    });

    it("uses a higher octave range than bass", () => {
      expect(interpretNotation("bass: C", { scale: "C Major" })[0]?.pitch).toBe(
        36,
      );
      expect(
        interpretNotation("melody: C", { scale: "C Major" })[0]?.pitch,
      ).toBe(60);
    });
  });

  describe("chords mode", () => {
    it("parses a basic chord progression in C major", () => {
      const result = interpretNotation("chords: C F G C", { scale: "C Major" });

      expect(result).toHaveLength(12);
      expect(result.slice(0, 3).map((n) => n.pitch)).toStrictEqual([
        48, 52, 55,
      ]);
    });

    it("infers chord quality from scale degree", () => {
      const result = interpretNotation("chords: D", { scale: "C Major" });

      expect(result.map((n) => n.pitch)).toStrictEqual([50, 53, 57]); // D minor
    });

    it("handles 7th chords", () => {
      const result = interpretNotation("chords: C7", { scale: "C Major" });

      expect(result.map((n) => n.pitch)).toStrictEqual([48, 52, 55, 59]); // Cmaj7
    });

    it("handles dynamics", () => {
      const result = interpretNotation("chords: C f", { scale: "C Major" });

      expect(result[0]?.velocity).toBeGreaterThanOrEqual(100);
      expect(result[3]?.velocity).toBeLessThanOrEqual(80);
    });

    it("handles bar markers", () => {
      const result = interpretNotation("chords: C / F", { scale: "C Major" });

      expect(result).toHaveLength(6);
      expect(result[3]?.start_time).toBe(4);
    });

    it("handles rests", () => {
      const result = interpretNotation("chords: C . F", { scale: "C Major" });

      expect(result).toHaveLength(6);
      expect(result[3]?.start_time).toBe(2);
    });

    it("sustains a chord by extending every chord note", () => {
      // Quarter-note chord then a quarter-note sustain doubles every note.
      const result = interpretNotation("chords: C - F", { scale: "C Major" });
      const cChord = result.slice(0, 3);

      for (const note of cChord) expect(note.duration).toBe(2.0);
      expect(result[3]?.start_time).toBe(2);
    });

    it("sustain extends only the most recent chord", () => {
      // C@0, F@1, sustain extends F (start 1) only; C (start 0) is untouched.
      const result = interpretNotation("chords: C F - C", { scale: "C Major" });

      for (const note of result.slice(0, 3)) expect(note.duration).toBe(1.0);
      for (const note of result.slice(3, 6)) expect(note.duration).toBe(2.0);
    });
  });

  describe("edge cases", () => {
    it("returns an empty array for empty input", () => {
      expect(interpretNotation("")).toStrictEqual([]);
      expect(interpretNotation("  ")).toStrictEqual([]);
    });

    it("defaults to C Major when no scale is provided", () => {
      const result = interpretNotation("melody: C");

      expect(result[0]?.pitch).toBe(60);
    });

    it("handles different time signatures", () => {
      const result = interpretNotation("kick: X x / X x", {
        timeSigNumerator: 3,
      });

      expect(result[2]?.start_time).toBe(3); // bar 2 in 3/4
    });

    it("throws a wrapped error on invalid syntax", () => {
      expect(() => interpretNotation("nonsense without a colon")).toThrow(
        /Stark notation parse error/,
      );
    });
  });
});

describe("stark-interpreter-helpers", () => {
  it("parseScale defaults to C Major", () => {
    expect(parseScale()).toStrictEqual({ root: 0, type: "major" });
  });

  it("parseScale parses a root and type", () => {
    expect(parseScale("Eb Minor")).toStrictEqual({ root: 3, type: "minor" });
  });

  it("parseScale rejects a single-token string", () => {
    expect(() => parseScale("C")).toThrow(/Invalid scale string/);
  });

  it("parseScale rejects an invalid root", () => {
    expect(() => parseScale("H Major")).toThrow(/Invalid scale root/);
  });

  it("parseScale rejects an unknown scale type", () => {
    expect(() => parseScale("C Bogus")).toThrow(/Unknown scale type/);
  });

  it("applyScale rejects an invalid letter", () => {
    expect(() => applyScale("H", 0, "major")).toThrow(/Invalid note letter/);
  });

  it("getChordQuality returns diatonic qualities", () => {
    expect(getChordQuality(0, "major", false)).toBe("major");
    expect(getChordQuality(6, "major", false)).toBe("diminished");
    expect(getChordQuality(4, "major", true)).toBe("dom7");
    expect(getChordQuality(0, "minor", false)).toBe("minor");
  });

  it("chooseOctave clamps below the range to its floor", () => {
    // prevMidi far below the bass range forces a low clamp.
    expect(chooseOctave(0, 0, 2, 4, 3)).toBe(24); // min octave 2 → MIDI 24
  });

  it("chooseOctave clamps above the range to its ceiling", () => {
    expect(chooseOctave(0, 200, 2, 4, 3)).toBe(48); // max octave 4 → MIDI 48
  });

  it("chooseOctave steps down when the octave below is closest", () => {
    // prev=50 (D3), pitch class B: same-octave B (59) is up a major 6th, but
    // the B below (47) is a minor 3rd down — closer, so it steps down.
    expect(chooseOctave(11, 50, 2, 6, 4)).toBe(47);
  });
});
