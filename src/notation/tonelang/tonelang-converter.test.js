// src/notation/tonelang/tonelang-converter.test.js
import { describe, expect, it } from "vitest";
import { convertClipNotesToToneLang, convertDrumClipNotesToToneLang, formatNotation } from "./tonelang-converter";

describe("convertClipNotesToToneLang", () => {
  it("formats overlapping notes as multiple voices", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 70 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 1, velocity: 70 }, // E3 overlaps with C3
      { pitch: 67, start_time: 2, duration: 1, velocity: 70 }, // G3 after C3
    ];

    const result = convertClipNotesToToneLang(clipNotes);

    expect(result).toBe("C3n2t1 E3 G3");
  });

  it("prefers to keep notes in the same voice when possible", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 }, // C3
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 }, // D3
      { pitch: 64, start_time: 0, duration: 1, velocity: 70 }, // E3 (same time as C3)
      { pitch: 65, start_time: 1, duration: 1, velocity: 70 }, // F3 (same time as D3)
      { pitch: 67, start_time: 2, duration: 1, velocity: 70 }, // G3
    ];

    const result = convertClipNotesToToneLang(clipNotes);

    expect(result).toBe("[C3 E3] [D3 F3] G3");
  });

  it("formats overlapping notes using t syntax", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 70 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 1, velocity: 70 }, // E3 overlaps with C3
      { pitch: 67, start_time: 2, duration: 1, velocity: 70 }, // G3 after C3
    ];

    const result = convertClipNotesToToneLang(clipNotes);
    expect(result).toBe("C3n2t1 E3 G3");
  });

  it("forms chords for notes with the same start time", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 }, // C3
      { pitch: 64, start_time: 0, duration: 1, velocity: 70 }, // E3
      { pitch: 67, start_time: 1, duration: 1, velocity: 70 }, // G3
    ];

    const result = convertClipNotesToToneLang(clipNotes);
    expect(result).toBe("[C3 E3] G3");
  });

  it("handles complex timing with multiple overlapping notes", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 4, velocity: 70 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 2, velocity: 70 }, // E3 starts during C3
      { pitch: 67, start_time: 3, duration: 2, velocity: 70 }, // G3 starts during C3 and E3
      { pitch: 71, start_time: 6, duration: 1, velocity: 70 }, // B3 after all previous notes
    ];

    const result = convertClipNotesToToneLang(clipNotes);
    expect(result).toBe("C3n4t1 E3n2 G3n2t3 B3");
  });
});

describe("convertDrumClipNotesToToneLang", () => {
  it("returns empty string for empty or null input", () => {
    expect(convertDrumClipNotesToToneLang([])).toBe("");
    expect(convertDrumClipNotesToToneLang(null)).toBe("");
    expect(convertDrumClipNotesToToneLang(undefined)).toBe("");
  });

  it("formats a single drum pad with single hit", () => {
    const clipNotes = [{ pitch: 36, start_time: 0, duration: 0.25, velocity: 100 }];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.25");
  });

  it("formats a single drum pad with multiple hits", () => {
    const clipNotes = [
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 36, start_time: 1, duration: 0.25, velocity: 80 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 120 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.25t1 C1v80n0.25t1 C1v120n0.25");
  });

  it("formats multiple drum pads as separate voices", () => {
    const clipNotes = [
      // Kick (36)
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
      // Snare (38)
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90 },
      { pitch: 38, start_time: 3, duration: 0.25, velocity: 90 },
      // Hi-hat (42)
      { pitch: 42, start_time: 0.5, duration: 0.25, velocity: 70 },
      { pitch: 42, start_time: 1.5, duration: 0.25, velocity: 70 },
      { pitch: 42, start_time: 2.5, duration: 0.25, velocity: 70 },
      { pitch: 42, start_time: 3.5, duration: 0.25, velocity: 70 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    // Expect three voices separated by semicolons (kick, snare, hi-hat) in pitch order
    expect(result).toBe(
      "C1v100n0.25t2 C1v100n0.25; D1v90n0.25t2 D1v90n0.25; Gb1n0.25t1 Gb1n0.25t1 Gb1n0.25t1 Gb1n0.25"
    );
  });

  it("handles varying durations and timings correctly", () => {
    const clipNotes = [
      // Kick with varying durations
      { pitch: 36, start_time: 0, duration: 0.5, velocity: 100 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
      // Snare with varying timings (not on standard beats)
      { pitch: 38, start_time: 1.25, duration: 0.25, velocity: 90 },
      { pitch: 38, start_time: 3.75, duration: 0.25, velocity: 90 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.5t2 C1v100n0.25; D1v90n0.25t2.5 D1v90n0.25");
  });

  it("groups notes by pitch even when interleaved in time", () => {
    const clipNotes = [
      // Totally mixed up order
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
      { pitch: 38, start_time: 3, duration: 0.25, velocity: 90 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.25t2 C1v100n0.25; D1v90n0.25t2 D1v90n0.25");
  });
});

describe("formatNotation", () => {
  it("formats regular notes using convertClipNotesToToneLang", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 },
    ];

    const result = formatNotation(notes);
    expect(result).toBe("C3 D3");
  });

  it("formats drum notes using convertDrumClipNotesToToneLang", () => {
    const notes = [
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 36, start_time: 1, duration: 0.25, velocity: 90 },
      { pitch: 38, start_time: 0, duration: 0.25, velocity: 90 },
    ];

    const result = formatNotation(notes, { isDrumTrack: true });
    expect(result).toBe("C1v100n0.25t1 C1v90n0.25; D1v90n0.25");
  });
});
