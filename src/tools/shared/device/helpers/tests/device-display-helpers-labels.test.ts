// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The display-label lexer: what each unit parses to, and how the patterns hold
// up against anchoring, stray whitespace, and optional signs. Split from
// device-display-helpers.test.ts (readParameter) to keep both under the line
// limit.

import { describe, expect, it } from "vitest";
import {
  extractMaxPanValue,
  isDivisionLabel,
  isDivisionParam,
  isPanLabel,
  normalizeDivisionLabel,
  normalizePan,
} from "../device-display-helpers.ts";
import { parseLabel, resolveEnumIndex } from "../device-label-helpers.ts";

// One well-formed label per LABEL_PATTERNS entry.
const UNIT_LABELS = [
  "1.00 kHz",
  "440 Hz",
  "100 ms",
  "1.00 s",
  "-6 dB",
  "-inf dB",
  "50 %",
  "180 °",
  "+12 st",
  "-50 ct",
  "10 sd",
  "C4",
  "50L",
  "C",
];

describe("parseLabel anchoring", () => {
  it.each(UNIT_LABELS)(
    "does not read a unit from '%s' when other text precedes it",
    (label) => {
      // Every pattern is `^`-anchored: a label is a value, not a haystack.
      expect(parseLabel(`x ${label}`).unit).toBeNull();
    },
  );

  it.each(UNIT_LABELS)(
    "does not read a unit from '%s' when other text follows it",
    (label) => {
      // Every pattern is `$`-anchored, so trailing text disqualifies the match.
      expect(parseLabel(`${label} x`).unit).toBeNull();
    },
  );

  it("does not extract a bare number that is not at the start", () => {
    expect(parseLabel("abc123")).toStrictEqual({ value: null, unit: null });
  });
});

describe("parseLabel optional whitespace", () => {
  it.each([
    { label: "5kHz", value: 5000, unit: "Hz" },
    { label: "100ms", value: 100, unit: "ms" },
    { label: "2s", value: 2000, unit: "ms" },
    { label: "-6dB", value: -6, unit: "dB" },
    { label: "-infdB", value: -70, unit: "dB" },
  ])(
    "parses '$label' with no space before the unit",
    ({ label, value, unit }) => {
      // The separator is `\s*` (zero or more), so a space is optional.
      expect(parseLabel(label)).toStrictEqual({ value, unit });
    },
  );
});

describe("parseLabel optional sign and multi-digit tokens", () => {
  it("parses an unsigned 'inf dB' as the -inf floor", () => {
    // The sign is optional (`-?inf`), so a bare "inf dB" still maps to -70.
    expect(parseLabel("inf dB")).toStrictEqual({ value: -70, unit: "dB" });
  });

  it("parses a note name with a multi-digit octave", () => {
    // The octave is `\d+`, not a single digit.
    expect(parseLabel("C10")).toStrictEqual({ value: "C10", unit: "note" });
  });
});

describe("parseLabel rejects labels with no number in them", () => {
  it.each(["-dB", ".Hz", "-%", ".kHz", "-degrees", "---", "-", ".."])(
    "returns nothing for '%s' rather than a NaN value",
    (label) => {
      // The numeric groups accept a bare "-" or ".", which parseFloat turns
      // into NaN. Every comparison against NaN is false, so a NaN escaping here
      // would walk a param to full scale and report success.
      expect(parseLabel(label)).toStrictEqual({ value: null, unit: null });
    },
  );
});

describe("isPanLabel anchoring", () => {
  it.each(["x50L", "50Lx", "xC", "Cx"])(
    "returns false for the unanchored label '%s'",
    (label) => {
      expect(isPanLabel(label)).toBe(false);
    },
  );
});

describe("isDivisionLabel anchoring", () => {
  it.each(["x1/8", "1/8x"])(
    "returns false for the unanchored label '%s'",
    (label) => {
      expect(isDivisionLabel(label)).toBe(false);
    },
  );
});

describe("normalizePan anchoring", () => {
  it.each(["x50L", "50Lx"])(
    "returns 0 (no match) for the unanchored label '%s'",
    (label) => {
      expect(normalizePan(label, 50)).toBe(0);
    },
  );
});

describe("extractMaxPanValue anchoring", () => {
  it.each(["x64L", "64Lx"])(
    "falls back to the default 50 for the unanchored label '%s'",
    (label) => {
      // A non-50 magnitude proves the fallback fired rather than the label
      // being matched unanchored.
      expect(extractMaxPanValue(label)).toBe(50);
    },
  );
});

describe("parseLabel ratios", () => {
  // Live writes compression as "N : 1" and expansion as "1 : N". Reading the
  // leading number off both would report 1 for every expansion ratio, which
  // collapses the range to a point and leaves a write nothing to aim at.
  it.each([
    ["4.00 : 1", 4],
    ["1.00 : 1", 1],
    ["1 : 2.00", 2],
    ["1 : 0.50", 0.5],
    ["1.0 : 0.25", 0.25],
  ])("reads the meaningful side of '%s'", (label, value) => {
    expect(parseLabel(label)).toStrictEqual({ value, unit: null });
  });

  it.each(["inf : 1", "1 : Inf", "1 : ", " : 1"])(
    "reads no number from '%s', leaving it to the sentinel trim",
    (label) => {
      expect(parseLabel(label)).toStrictEqual({ value: null, unit: null });
    },
  );
});

describe("isDivisionLabel spacing", () => {
  it.each(["1/16", "1 / 16", "1/ 16", "1 /16"])(
    "accepts '%s', which Live spaces differently per param",
    (label) => {
      expect(isDivisionLabel(label)).toBe(true);
    },
  );
});

describe("isDivisionParam", () => {
  it("sees a fraction at the max end", () => {
    // Sync ladders run from bar counts to fractions ("8".."1/64"), so the
    // current value and the minimum are both bare numbers.
    expect(isDivisionParam("2", "8", "1/64")).toBe(true);
  });

  it("stays false when no end names a fraction", () => {
    expect(isDivisionParam("0.0 dB", "-70 dB", "6 dB")).toBe(false);
  });
});

describe("normalizeDivisionLabel", () => {
  it("makes a written '1/16' match a label Live spaced as '1 / 16'", () => {
    expect(normalizeDivisionLabel("1 / 16")).toBe(
      normalizeDivisionLabel("1/16"),
    );
  });
});

describe("parseLabel", () => {
  describe("frequency (Hz)", () => {
    it("parses kHz and converts to Hz", () => {
      expect(parseLabel("1.00 kHz")).toStrictEqual({
        value: 1000,
        unit: "Hz",
      });
      expect(parseLabel("12.5 kHz")).toStrictEqual({
        value: 12500,
        unit: "Hz",
      });
      expect(parseLabel("0.5 kHz")).toStrictEqual({ value: 500, unit: "Hz" });
    });

    it("parses Hz directly", () => {
      expect(parseLabel("440 Hz")).toStrictEqual({ value: 440, unit: "Hz" });
      expect(parseLabel("20 Hz")).toStrictEqual({ value: 20, unit: "Hz" });
    });
  });

  describe("time (ms)", () => {
    it("parses seconds and converts to ms", () => {
      expect(parseLabel("1.00 s")).toStrictEqual({ value: 1000, unit: "ms" });
      expect(parseLabel("0.5 s")).toStrictEqual({ value: 500, unit: "ms" });
      expect(parseLabel("2.5 s")).toStrictEqual({ value: 2500, unit: "ms" });
    });

    it("parses ms directly", () => {
      expect(parseLabel("100 ms")).toStrictEqual({ value: 100, unit: "ms" });
      expect(parseLabel("500 ms")).toStrictEqual({ value: 500, unit: "ms" });
    });
  });

  describe("decibels (dB)", () => {
    it("parses positive and negative dB values", () => {
      expect(parseLabel("0 dB")).toStrictEqual({ value: 0, unit: "dB" });
      expect(parseLabel("-6 dB")).toStrictEqual({ value: -6, unit: "dB" });
      expect(parseLabel("-18.5 dB")).toStrictEqual({
        value: -18.5,
        unit: "dB",
      });
      expect(parseLabel("3 dB")).toStrictEqual({ value: 3, unit: "dB" });
    });

    it("converts -inf dB to -70", () => {
      expect(parseLabel("-inf dB")).toStrictEqual({ value: -70, unit: "dB" });
    });
  });

  describe("percentage (%)", () => {
    it("parses percentage values", () => {
      expect(parseLabel("0 %")).toStrictEqual({ value: 0, unit: "%" });
      expect(parseLabel("50 %")).toStrictEqual({ value: 50, unit: "%" });
      expect(parseLabel("100 %")).toStrictEqual({ value: 100, unit: "%" });
      expect(parseLabel("-50 %")).toStrictEqual({ value: -50, unit: "%" });
    });

    it("parses 'percent' word as %", () => {
      expect(parseLabel("50 percent")).toStrictEqual({
        value: 50,
        unit: "%",
      });
      expect(parseLabel("100percent")).toStrictEqual({
        value: 100,
        unit: "%",
      });
      expect(parseLabel("25 PERCENT")).toStrictEqual({
        value: 25,
        unit: "%",
      });
    });
  });

  describe("degrees (°)", () => {
    it("parses degree values", () => {
      expect(parseLabel("300°")).toStrictEqual({
        value: 300,
        unit: "degrees",
      });
      expect(parseLabel("0°")).toStrictEqual({ value: 0, unit: "degrees" });
      expect(parseLabel("180 °")).toStrictEqual({
        value: 180,
        unit: "degrees",
      });
      expect(parseLabel("-90°")).toStrictEqual({
        value: -90,
        unit: "degrees",
      });
    });

    it("parses 'degrees', 'degree', and 'deg' as °", () => {
      expect(parseLabel("180 degrees")).toStrictEqual({
        value: 180,
        unit: "degrees",
      });
      expect(parseLabel("1 degree")).toStrictEqual({
        value: 1,
        unit: "degrees",
      });
      expect(parseLabel("90 deg")).toStrictEqual({
        value: 90,
        unit: "degrees",
      });
      expect(parseLabel("180DEGREES")).toStrictEqual({
        value: 180,
        unit: "degrees",
      });
      expect(parseLabel("-45deg")).toStrictEqual({
        value: -45,
        unit: "degrees",
      });
    });
  });

  describe("note names", () => {
    it("parses note names and keeps as string", () => {
      expect(parseLabel("C4")).toStrictEqual({ value: "C4", unit: "note" });
      expect(parseLabel("F#-1")).toStrictEqual({
        value: "F#-1",
        unit: "note",
      });
      expect(parseLabel("Bb3")).toStrictEqual({ value: "Bb3", unit: "note" });
      expect(parseLabel("G#8")).toStrictEqual({ value: "G#8", unit: "note" });
    });
  });

  describe("pan", () => {
    it("parses pan labels with direction", () => {
      expect(parseLabel("50L")).toStrictEqual({
        value: 50,
        unit: "pan",
        direction: "L",
      });
      expect(parseLabel("50R")).toStrictEqual({
        value: 50,
        unit: "pan",
        direction: "R",
      });
      expect(parseLabel("25L")).toStrictEqual({
        value: 25,
        unit: "pan",
        direction: "L",
      });
    });

    it("parses center pan as fixed value", () => {
      expect(parseLabel("C")).toStrictEqual({ value: 0, unit: "pan" });
    });
  });

  describe("unitless numbers", () => {
    it("extracts numbers without units", () => {
      expect(parseLabel("76")).toStrictEqual({ value: 76, unit: null });
      expect(parseLabel("0.5")).toStrictEqual({ value: 0.5, unit: null });
      expect(parseLabel("-3.5")).toStrictEqual({ value: -3.5, unit: null });
    });
  });

  describe("edge cases", () => {
    it("returns null for non-parseable strings", () => {
      expect(parseLabel("Repitch")).toStrictEqual({
        value: null,
        unit: null,
      });
      expect(parseLabel("Off")).toStrictEqual({ value: null, unit: null });
    });

    it("trims whitespace from VST-style right-padded labels", () => {
      expect(parseLabel("    8 Hz")).toStrictEqual({ value: 8, unit: "Hz" });
      expect(parseLabel("  425 Hz")).toStrictEqual({
        value: 425,
        unit: "Hz",
      });
      expect(parseLabel("22050 Hz ")).toStrictEqual({
        value: 22050,
        unit: "Hz",
      });
      expect(parseLabel("  -6 dB")).toStrictEqual({ value: -6, unit: "dB" });
    });

    it("handles null/undefined/non-string input", () => {
      expect(parseLabel(null as unknown as string)).toStrictEqual({
        value: null,
        unit: null,
      });
      expect(parseLabel(undefined as unknown as string)).toStrictEqual({
        value: null,
        unit: null,
      });
      expect(parseLabel(123 as unknown as string)).toStrictEqual({
        value: null,
        unit: null,
      });
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
    expect(isPanLabel(null as unknown as string)).toBe(false);
    expect(isPanLabel(undefined as unknown as string)).toBe(false);
  });
});

describe("isDivisionLabel", () => {
  it("returns true for division fraction labels", () => {
    expect(isDivisionLabel("1/8")).toBe(true);
    expect(isDivisionLabel("1/16")).toBe(true);
    expect(isDivisionLabel("1/64")).toBe(true);
    expect(isDivisionLabel("1/4")).toBe(true);
    expect(isDivisionLabel("1/2")).toBe(true);
  });

  it("returns false for non-division labels", () => {
    expect(isDivisionLabel("2/4")).toBe(false); // must start with 1/
    expect(isDivisionLabel("1")).toBe(false);
    expect(isDivisionLabel("1/")).toBe(false);
    expect(isDivisionLabel("50 Hz")).toBe(false);
    expect(isDivisionLabel(null as unknown as string)).toBe(false);
    expect(isDivisionLabel(undefined as unknown as string)).toBe(false);
    expect(isDivisionLabel(123 as unknown as string)).toBe(false);
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

  it("returns 0 for non-matching label", () => {
    expect(normalizePan("invalid", 50)).toBe(0);
    expect(normalizePan("", 50)).toBe(0);
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

describe("resolveEnumIndex", () => {
  it("matches an option by exact label", () => {
    expect(resolveEnumIndex(["Repitch", "Fade", "Jump"], "Fade")).toBe(1);
  });

  it("matches an option case-insensitively", () => {
    expect(resolveEnumIndex(["Repitch", "Fade", "Jump"], "fade")).toBe(1);
  });

  it("returns -1 when nothing matches", () => {
    expect(resolveEnumIndex(["Repitch", "Fade", "Jump"], "Warp")).toBe(-1);
  });

  it.each([
    ["On", 1],
    ["on", 1],
    ["true", 1],
    [1, 1],
    ["1", 1],
    ["Off", 0],
    ["off", 0],
    ["false", 0],
    [0, 0],
    ["0", 0],
  ])("accepts %s as index %i for an Off/On pair", (value, index) => {
    expect(resolveEnumIndex(["Off", "On"], value)).toBe(index);
  });

  it("accepts an On/Off pair in either order", () => {
    expect(resolveEnumIndex(["On", "Off"], "false")).toBe(1);
    expect(resolveEnumIndex(["On", "Off"], "true")).toBe(0);
  });

  it("does not treat 0/1 or booleans as toggles when the pair isn't Off/On", () => {
    expect(resolveEnumIndex(["Peak", "RMS"], "0")).toBe(-1);
    expect(resolveEnumIndex(["Peak", "RMS"], "true")).toBe(-1);
  });

  it("does not treat 0/1 or booleans as toggles for more than two options", () => {
    expect(resolveEnumIndex(["Off", "On", "Auto"], "true")).toBe(-1);
  });
});
