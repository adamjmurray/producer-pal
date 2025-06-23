// src/notation/pitch-class-name-to-number.test.js
import { describe, expect, it } from "vitest";
import {
  PITCH_CLASS_VALUES,
  VALID_PITCH_CLASS_NAMES,
  pitchClassNameToNumber,
  isValidPitchClassName,
} from "./pitch-class-name-to-number.js";

describe("pitch-class-name-to-number", () => {
  describe("PITCH_CLASS_VALUES", () => {
    it("should map natural notes correctly", () => {
      expect(PITCH_CLASS_VALUES["C"]).toBe(0);
      expect(PITCH_CLASS_VALUES["D"]).toBe(2);
      expect(PITCH_CLASS_VALUES["E"]).toBe(4);
      expect(PITCH_CLASS_VALUES["F"]).toBe(5);
      expect(PITCH_CLASS_VALUES["G"]).toBe(7);
      expect(PITCH_CLASS_VALUES["A"]).toBe(9);
      expect(PITCH_CLASS_VALUES["B"]).toBe(11);
    });

    it("should map sharp and flat enharmonic equivalents", () => {
      expect(PITCH_CLASS_VALUES["C#"]).toBe(1);
      expect(PITCH_CLASS_VALUES["Db"]).toBe(1);
      expect(PITCH_CLASS_VALUES["D#"]).toBe(3);
      expect(PITCH_CLASS_VALUES["Eb"]).toBe(3);
      expect(PITCH_CLASS_VALUES["F#"]).toBe(6);
      expect(PITCH_CLASS_VALUES["Gb"]).toBe(6);
      expect(PITCH_CLASS_VALUES["G#"]).toBe(8);
      expect(PITCH_CLASS_VALUES["Ab"]).toBe(8);
      expect(PITCH_CLASS_VALUES["A#"]).toBe(10);
      expect(PITCH_CLASS_VALUES["Bb"]).toBe(10);
    });
  });

  describe("VALID_PITCH_CLASS_NAMES", () => {
    it("should include all pitch class names", () => {
      expect(VALID_PITCH_CLASS_NAMES).toContain("C");
      expect(VALID_PITCH_CLASS_NAMES).toContain("C#");
      expect(VALID_PITCH_CLASS_NAMES).toContain("Db");
      expect(VALID_PITCH_CLASS_NAMES).toContain("Bb");
      expect(VALID_PITCH_CLASS_NAMES).toHaveLength(17); // 7 naturals + 10 accidentals
    });
  });

  describe("pitchClassNameToNumber", () => {
    it("should convert valid pitch class names to numbers", () => {
      expect(pitchClassNameToNumber("C")).toBe(0);
      expect(pitchClassNameToNumber("C#")).toBe(1);
      expect(pitchClassNameToNumber("Db")).toBe(1);
      expect(pitchClassNameToNumber("D")).toBe(2);
      expect(pitchClassNameToNumber("F#")).toBe(6);
      expect(pitchClassNameToNumber("Gb")).toBe(6);
      expect(pitchClassNameToNumber("Bb")).toBe(10);
      expect(pitchClassNameToNumber("B")).toBe(11);
    });

    it("should throw error for invalid pitch class names", () => {
      expect(() => pitchClassNameToNumber("invalid")).toThrow(
        "Invalid pitch class",
      );
      expect(() => pitchClassNameToNumber("H")).toThrow("Invalid pitch class");
      expect(() => pitchClassNameToNumber("c")).toThrow("Invalid pitch class");
      expect(() => pitchClassNameToNumber("C##")).toThrow(
        "Invalid pitch class",
      );
      expect(() => pitchClassNameToNumber("")).toThrow("Invalid pitch class");
    });

    it("should throw error for non-string inputs", () => {
      expect(() => pitchClassNameToNumber(123)).toThrow(
        "Invalid pitch class: must be a string",
      );
      expect(() => pitchClassNameToNumber(null)).toThrow(
        "Invalid pitch class: must be a string",
      );
      expect(() => pitchClassNameToNumber(undefined)).toThrow(
        "Invalid pitch class: must be a string",
      );
    });
  });

  describe("isValidPitchClassName", () => {
    it("should return true for valid pitch class names", () => {
      expect(isValidPitchClassName("C")).toBe(true);
      expect(isValidPitchClassName("C#")).toBe(true);
      expect(isValidPitchClassName("Db")).toBe(true);
      expect(isValidPitchClassName("Bb")).toBe(true);
    });

    it("should return false for invalid pitch class names", () => {
      expect(isValidPitchClassName("invalid")).toBe(false);
      expect(isValidPitchClassName("H")).toBe(false);
      expect(isValidPitchClassName("c")).toBe(false);
      expect(isValidPitchClassName("")).toBe(false);
      expect(isValidPitchClassName(123)).toBe(false);
      expect(isValidPitchClassName(null)).toBe(false);
      expect(isValidPitchClassName(undefined)).toBe(false);
    });
  });
});
