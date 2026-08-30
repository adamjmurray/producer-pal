// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Robustness of the display-label lexer: anchoring, optional whitespace, and
// optional sign/quantifier handling. Split from device-display-helpers.test.ts
// (unit-by-unit value parsing) to keep both files under the line limit.

import { describe, expect, it } from "vitest";
import {
  extractMaxPanValue,
  isDivisionLabel,
  isPanLabel,
  normalizePan,
} from "../device-display-helpers.ts";
import { parseLabel } from "../device-label-helpers.ts";

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
