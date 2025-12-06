import { describe, expect, it } from "vitest";
import {
  parseLabel,
  isPanLabel,
  normalizePan,
  extractMaxPanValue,
  midiToNoteName,
  noteNameToMidi,
  isNoteName,
} from "./device-display-helpers.js";

describe("device-display-helpers", () => {
  describe("parseLabel", () => {
    describe("frequency (Hz)", () => {
      it("parses kHz and converts to Hz", () => {
        expect(parseLabel("1.00 kHz")).toEqual({ value: 1000, unit: "Hz" });
        expect(parseLabel("12.5 kHz")).toEqual({ value: 12500, unit: "Hz" });
        expect(parseLabel("0.5 kHz")).toEqual({ value: 500, unit: "Hz" });
      });

      it("parses Hz directly", () => {
        expect(parseLabel("440 Hz")).toEqual({ value: 440, unit: "Hz" });
        expect(parseLabel("20 Hz")).toEqual({ value: 20, unit: "Hz" });
      });
    });

    describe("time (ms)", () => {
      it("parses seconds and converts to ms", () => {
        expect(parseLabel("1.00 s")).toEqual({ value: 1000, unit: "ms" });
        expect(parseLabel("0.5 s")).toEqual({ value: 500, unit: "ms" });
        expect(parseLabel("2.5 s")).toEqual({ value: 2500, unit: "ms" });
      });

      it("parses ms directly", () => {
        expect(parseLabel("100 ms")).toEqual({ value: 100, unit: "ms" });
        expect(parseLabel("500 ms")).toEqual({ value: 500, unit: "ms" });
      });
    });

    describe("decibels (dB)", () => {
      it("parses positive and negative dB values", () => {
        expect(parseLabel("0 dB")).toEqual({ value: 0, unit: "dB" });
        expect(parseLabel("-6 dB")).toEqual({ value: -6, unit: "dB" });
        expect(parseLabel("-18.5 dB")).toEqual({ value: -18.5, unit: "dB" });
        expect(parseLabel("3 dB")).toEqual({ value: 3, unit: "dB" });
      });

      it("converts -inf dB to -70", () => {
        expect(parseLabel("-inf dB")).toEqual({ value: -70, unit: "dB" });
      });
    });

    describe("percentage (%)", () => {
      it("parses percentage values", () => {
        expect(parseLabel("0 %")).toEqual({ value: 0, unit: "%" });
        expect(parseLabel("50 %")).toEqual({ value: 50, unit: "%" });
        expect(parseLabel("100 %")).toEqual({ value: 100, unit: "%" });
        expect(parseLabel("-50 %")).toEqual({ value: -50, unit: "%" });
      });
    });

    describe("semitones (st)", () => {
      it("parses semitone values", () => {
        expect(parseLabel("0 st")).toEqual({ value: 0, unit: "st" });
        expect(parseLabel("+12 st")).toEqual({ value: 12, unit: "st" });
        expect(parseLabel("-24 st")).toEqual({ value: -24, unit: "st" });
        expect(parseLabel("7 st")).toEqual({ value: 7, unit: "st" });
      });
    });

    describe("note names", () => {
      it("parses note names and keeps as string", () => {
        expect(parseLabel("C4")).toEqual({ value: "C4", unit: "note" });
        expect(parseLabel("F#-1")).toEqual({ value: "F#-1", unit: "note" });
        expect(parseLabel("Bb3")).toEqual({ value: "Bb3", unit: "note" });
        expect(parseLabel("G#8")).toEqual({ value: "G#8", unit: "note" });
      });
    });

    describe("pan", () => {
      it("parses pan labels with direction", () => {
        expect(parseLabel("50L")).toEqual({
          value: 50,
          unit: "pan",
          direction: "L",
        });
        expect(parseLabel("50R")).toEqual({
          value: 50,
          unit: "pan",
          direction: "R",
        });
        expect(parseLabel("25L")).toEqual({
          value: 25,
          unit: "pan",
          direction: "L",
        });
      });

      it("parses center pan as fixed value", () => {
        expect(parseLabel("C")).toEqual({ value: 0, unit: "pan" });
      });
    });

    describe("unitless numbers", () => {
      it("extracts numbers without units", () => {
        expect(parseLabel("76")).toEqual({ value: 76, unit: null });
        expect(parseLabel("0.5")).toEqual({ value: 0.5, unit: null });
        expect(parseLabel("-3.5")).toEqual({ value: -3.5, unit: null });
      });
    });

    describe("edge cases", () => {
      it("returns null for non-parseable strings", () => {
        expect(parseLabel("Repitch")).toEqual({ value: null, unit: null });
        expect(parseLabel("Off")).toEqual({ value: null, unit: null });
      });

      it("handles null/undefined/non-string input", () => {
        expect(parseLabel(null)).toEqual({ value: null, unit: null });
        expect(parseLabel(undefined)).toEqual({ value: null, unit: null });
        expect(parseLabel(123)).toEqual({ value: null, unit: null });
      });
    });
  });

  describe("isPanLabel", () => {
    it("returns true for pan labels", () => {
      expect(isPanLabel("50L")).toBe(true);
      expect(isPanLabel("50R")).toBe(true);
      expect(isPanLabel("C")).toBe(true);
      expect(isPanLabel("25L")).toBe(true);
    });

    it("returns false for non-pan labels", () => {
      expect(isPanLabel("50 Hz")).toBe(false);
      expect(isPanLabel("Center")).toBe(false);
      expect(isPanLabel(null)).toBe(false);
      expect(isPanLabel(undefined)).toBe(false);
    });
  });

  describe("normalizePan", () => {
    it("normalizes pan values to -1 to 1", () => {
      expect(normalizePan("50L", 50)).toBe(-1);
      expect(normalizePan("50R", 50)).toBe(1);
      expect(normalizePan("25L", 50)).toBe(-0.5);
      expect(normalizePan("25R", 50)).toBe(0.5);
      expect(normalizePan("C", 50)).toBe(0);
    });

    it("handles different max pan values", () => {
      expect(normalizePan("64L", 64)).toBe(-1);
      expect(normalizePan("64R", 64)).toBe(1);
      expect(normalizePan("32L", 64)).toBe(-0.5);
    });
  });

  describe("extractMaxPanValue", () => {
    it("extracts max pan value from label", () => {
      expect(extractMaxPanValue("50L")).toBe(50);
      expect(extractMaxPanValue("50R")).toBe(50);
      expect(extractMaxPanValue("64L")).toBe(64);
    });

    it("returns default 50 for non-matching labels", () => {
      expect(extractMaxPanValue("C")).toBe(50);
      expect(extractMaxPanValue("invalid")).toBe(50);
    });
  });

  describe("midiToNoteName", () => {
    it("converts MIDI notes to note names (Live convention: C3=60)", () => {
      expect(midiToNoteName(60)).toBe("C3");
      expect(midiToNoteName(69)).toBe("A3");
      expect(midiToNoteName(0)).toBe("C-2");
      expect(midiToNoteName(127)).toBe("G8");
      expect(midiToNoteName(61)).toBe("C#3");
    });
  });

  describe("noteNameToMidi", () => {
    it("converts note names to MIDI numbers (Live convention: C3=60)", () => {
      expect(noteNameToMidi("C3")).toBe(60);
      expect(noteNameToMidi("A3")).toBe(69);
      expect(noteNameToMidi("C-2")).toBe(0);
      expect(noteNameToMidi("G8")).toBe(127);
      expect(noteNameToMidi("C#3")).toBe(61);
      expect(noteNameToMidi("Db3")).toBe(61);
    });

    it("returns null for invalid note names", () => {
      expect(noteNameToMidi("invalid")).toBe(null);
      expect(noteNameToMidi("H4")).toBe(null);
      expect(noteNameToMidi("")).toBe(null);
    });
  });

  describe("isNoteName", () => {
    it("returns true for valid note names", () => {
      expect(isNoteName("C4")).toBe(true);
      expect(isNoteName("F#-1")).toBe(true);
      expect(isNoteName("Bb3")).toBe(true);
      expect(isNoteName("G#8")).toBe(true);
    });

    it("returns false for non-note values", () => {
      expect(isNoteName("50L")).toBe(false);
      expect(isNoteName("100 Hz")).toBe(false);
      expect(isNoteName(60)).toBe(false);
      expect(isNoteName(null)).toBe(false);
    });
  });
});
