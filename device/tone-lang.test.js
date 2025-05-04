// device/tone-lang.test.js
import { describe, it, expect } from "vitest";

// Import module under test
const { parseToneLangNote, parseToneLang } = require("./tone-lang");

describe("parseToneLangNote", () => {
  it("should correctly parse natural notes", () => {
    expect(parseToneLangNote("C3")).toBe(60); // Middle C
    expect(parseToneLangNote("D3")).toBe(62);
    expect(parseToneLangNote("E3")).toBe(64);
    expect(parseToneLangNote("F3")).toBe(65);
    expect(parseToneLangNote("G3")).toBe(67);
    expect(parseToneLangNote("A3")).toBe(69);
    expect(parseToneLangNote("B3")).toBe(71);
  });

  it("should correctly parse sharp notes", () => {
    expect(parseToneLangNote("C#3")).toBe(61);
    expect(parseToneLangNote("D#3")).toBe(63);
    expect(parseToneLangNote("F#3")).toBe(66);
    expect(parseToneLangNote("G#3")).toBe(68);
    expect(parseToneLangNote("A#3")).toBe(70);
  });

  it("should correctly parse flat notes", () => {
    expect(parseToneLangNote("Db3")).toBe(61);
    expect(parseToneLangNote("Eb3")).toBe(63);
    expect(parseToneLangNote("Gb3")).toBe(66);
    expect(parseToneLangNote("Ab3")).toBe(68);
    expect(parseToneLangNote("Bb3")).toBe(70);
  });

  it("should handle different octaves correctly", () => {
    expect(parseToneLangNote("C0")).toBe(24);
    expect(parseToneLangNote("C1")).toBe(36);
    expect(parseToneLangNote("C2")).toBe(48);
    expect(parseToneLangNote("C4")).toBe(72);
    expect(parseToneLangNote("C5")).toBe(84);
  });

  it("should return null for invalid note formats", () => {
    expect(parseToneLangNote("H3")).toBe(null); // Invalid note name
    expect(parseToneLangNote("Cb3")).toBe(null); // Invalid accidental for C
    expect(parseToneLangNote("C#b3")).toBe(null); // Invalid accidental combination
    expect(parseToneLangNote("C")).toBe(null); // Missing octave
    expect(parseToneLangNote("3C")).toBe(null); // Wrong order
    expect(parseToneLangNote("")).toBe(null); // Empty string
  });
});

describe("parseToneLang", () => {
  it("should return an empty array when input is empty", () => {
    expect(parseToneLang("")).toEqual([]);
    expect(parseToneLang(null)).toEqual([]);
    expect(parseToneLang(undefined)).toEqual([]);
  });

  it("should parse a sequence of single notes", () => {
    const result = parseToneLang("C3 D3 E3");

    expect(result.length).toBe(3);

    expect(result[0].pitch).toBe(60); // C3
    expect(result[0].start_time).toBe(0);
    expect(result[0].duration).toBe(1);

    expect(result[1].pitch).toBe(62); // D3
    expect(result[1].start_time).toBe(1);
    expect(result[1].duration).toBe(1);

    expect(result[2].pitch).toBe(64); // E3
    expect(result[2].start_time).toBe(2);
    expect(result[2].duration).toBe(1);
  });

  it("should parse chords with correct start times", () => {
    const result = parseToneLang("[C3 E3 G3] [F3 A3 C4]");

    expect(result.length).toBe(6);

    // First chord
    expect(result[0].pitch).toBe(60); // C3
    expect(result[0].start_time).toBe(0);
    expect(result[1].pitch).toBe(64); // E3
    expect(result[1].start_time).toBe(0);
    expect(result[2].pitch).toBe(67); // G3
    expect(result[2].start_time).toBe(0);

    // Second chord
    expect(result[3].pitch).toBe(65); // F3
    expect(result[3].start_time).toBe(1);
    expect(result[4].pitch).toBe(69); // A3
    expect(result[4].start_time).toBe(1);
    expect(result[5].pitch).toBe(72); // C4
    expect(result[5].start_time).toBe(1);
  });

  it("should apply custom duration correctly", () => {
    const result = parseToneLang("C3 D3", 0.5);

    expect(result.length).toBe(2);
    expect(result[0].duration).toBe(0.5);
    expect(result[1].duration).toBe(0.5);
    expect(result[1].start_time).toBe(0.5); // Half beat after first note
  });

  it("should handle mixed single notes and chords", () => {
    const result = parseToneLang("C3 [D3 F3] E3");

    expect(result.length).toBe(4);

    expect(result[0].pitch).toBe(60); // C3
    expect(result[0].start_time).toBe(0);

    expect(result[1].pitch).toBe(62); // D3 (in chord)
    expect(result[1].start_time).toBe(1);
    expect(result[2].pitch).toBe(65); // F3 (in chord)
    expect(result[2].start_time).toBe(1);

    expect(result[3].pitch).toBe(64); // E3
    expect(result[3].start_time).toBe(2);
  });

  it("should ignore invalid notes", () => {
    const result = parseToneLang("C3 X9 E3");

    expect(result.length).toBe(2);
    expect(result[0].pitch).toBe(60); // C3
    expect(result[1].pitch).toBe(64); // E3
    expect(result[1].start_time).toBe(1); // Invalid note is skipped but takes up no time
    // TODO: reconsider if invalid notes should be treated like rests
  });
});
