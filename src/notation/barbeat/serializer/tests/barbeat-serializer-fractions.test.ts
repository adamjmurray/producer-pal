// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  formatAbsoluteDuration,
  formatBeatPosition,
  formatDecimal,
  formatOffGridBeats,
} from "../helpers/barbeat-serializer-fractions.ts";

describe("formatBeatPosition", () => {
  it("formats integers as-is", () => {
    expect(formatBeatPosition(1, 4)).toBe("1");
    expect(formatBeatPosition(4, 4)).toBe("4");
    expect(formatBeatPosition(10, 4)).toBe("10");
  });

  it("prefers decimal for dyadic sub-beats (shorter and lossless)", () => {
    expect(formatBeatPosition(1.25, 4)).toBe("1.25");
    expect(formatBeatPosition(1.5, 4)).toBe("1.5");
    expect(formatBeatPosition(1.75, 4)).toBe("1.75");
    expect(formatBeatPosition(2.5, 4)).toBe("2.5");
    // Eighth-of-a-beat positions are dyadic and exact as decimals — preferred
    // over the longer `+n/32` offset form.
    expect(formatBeatPosition(1.125, 4)).toBe("1.125");
    expect(formatBeatPosition(1.375, 4)).toBe("1.375");
    expect(formatBeatPosition(1.875, 4)).toBe("1.875");
  });

  it("uses a +n note-value offset for eighth-triplet positions (lossy decimals)", () => {
    // 1/3 of a beat = a 1/12-whole-note offset (eighth triplet)
    expect(formatBeatPosition(1 + 1 / 3, 4)).toBe("1+n/12");
    expect(formatBeatPosition(1 + 2 / 3, 4)).toBe("1+n/6");
    expect(formatBeatPosition(2 + 1 / 3, 4)).toBe("2+n/12");
    expect(formatBeatPosition(4 / 3, 4)).toBe("1+n/12");
    expect(formatBeatPosition(8 / 3, 4)).toBe("2+n/6");
    // 3/2 = 1.5 → decimal is shorter and lossless
    expect(formatBeatPosition(3 / 2, 4)).toBe("1.5");
  });

  it("uses a +n offset for quarter-triplet (sixth) positions", () => {
    // 1/6 of a beat = a 1/24-whole-note offset
    expect(formatBeatPosition(1 + 1 / 6, 4)).toBe("1+n/24");
    expect(formatBeatPosition(1 + 5 / 6, 4)).toBe("1+n5/24");
  });

  it("uses a +n offset for fine (sixteenth/twelfth-of-a-beat) positions", () => {
    // 1/16 of a beat = a 1/64-whole-note offset (a 64th note)
    expect(formatBeatPosition(1 + 1 / 16, 4)).toBe("1+n/64");
    expect(formatBeatPosition(1 + 3 / 16, 4)).toBe("1+n3/64");
    // 1/12 of a beat = a 1/48-whole-note offset
    expect(formatBeatPosition(1 + 1 / 12, 4)).toBe("1+n/48");
    expect(formatBeatPosition(1 + 5 / 12, 4)).toBe("1+n5/48");
  });

  it("keeps the bare decimal for off-grid values that round-trip exactly", () => {
    expect(formatBeatPosition(1.123, 4)).toBe("1.123");
    expect(formatBeatPosition(2.789, 4)).toBe("2.789");
  });

  it("uses the decimal-numerator escape for off-grid positions ≥ 1 that the decimal can't hold (F2)", () => {
    // A 4-decimal off-grid position can't be held by the 3-decimal grid beat
    // (2.9877 → "2.988" would reparse to 2.988, a silent drift). It now spells
    // with the lossless `base+n<beats>/4` escape, matching the sub-1 branch,
    // rather than truncating. (Off-grid positions that ARE exact at 3 decimals
    // keep the shorter bare decimal — see the case above.)
    expect(formatBeatPosition(2.9877, 4)).toBe("2+n0.9877/4");
  });

  it("uses the decimal-numerator escape for off-grid pre-downbeat positions (F5)", () => {
    // A genuinely off-grid sub-1 (pre-downbeat) position has no clean note-value
    // offset and no bare sub-1 decimal beat to fall back to. It spells with the
    // lossless `1-n<beats>/4` escape (delegated to formatAbsoluteDuration), which
    // the widened `±n`-offset grammars parse back exactly.
    expect(formatBeatPosition(0.8766, 4)).toBe("1-n0.1234/4");
  });

  it("scales the offset note value by meter (denominator-aware)", () => {
    // In 6/8 a beat is an eighth, so 1/3 of a beat = a 1/24-whole-note offset.
    expect(formatBeatPosition(1 + 1 / 3, 8)).toBe("1+n/24");
    // In 2/2 a beat is a half note, so 1/3 of a beat = a 1/6-whole-note offset.
    expect(formatBeatPosition(1 + 1 / 3, 2)).toBe("1+n/6");
  });
});

describe("formatAbsoluteDuration", () => {
  it("formats common note values with /den shorthand", () => {
    expect(formatAbsoluteDuration(1)).toBe("/1"); // whole
    expect(formatAbsoluteDuration(1 / 2)).toBe("/2"); // half
    expect(formatAbsoluteDuration(1 / 4)).toBe("/4"); // quarter
    expect(formatAbsoluteDuration(1 / 8)).toBe("/8"); // eighth
    expect(formatAbsoluteDuration(1 / 16)).toBe("/16"); // sixteenth
    expect(formatAbsoluteDuration(1 / 32)).toBe("/32"); // thirty-second
  });

  it("formats triplet/tuplet denominators", () => {
    expect(formatAbsoluteDuration(1 / 3)).toBe("/3"); // half-note triplet
    expect(formatAbsoluteDuration(1 / 6)).toBe("/6"); // quarter-note triplet
    expect(formatAbsoluteDuration(1 / 12)).toBe("/12"); // eighth-note triplet
    expect(formatAbsoluteDuration(1 / 24)).toBe("/24"); // sixteenth-note triplet
    expect(formatAbsoluteDuration(1 / 20)).toBe("/20"); // sixteenth quintuplet
  });

  it("formats non-unit numerators", () => {
    expect(formatAbsoluteDuration(3 / 8)).toBe("3/8"); // dotted quarter
    expect(formatAbsoluteDuration(3 / 4)).toBe("3/4"); // dotted half / 3 quarters
    expect(formatAbsoluteDuration(3 / 16)).toBe("3/16"); // dotted eighth
    expect(formatAbsoluteDuration(2 / 3)).toBe("2/3"); // 2 half-note triplets
    expect(formatAbsoluteDuration(5 / 4)).toBe("5/4"); // 5 quarter notes (5/4 bar)
    expect(formatAbsoluteDuration(5 / 8)).toBe("5/8"); // 5 eighth notes
  });

  it("formats values >= 1 (multi-whole-note durations)", () => {
    expect(formatAbsoluteDuration(2)).toBe("2/1"); // 2 whole notes
    expect(formatAbsoluteDuration(4)).toBe("4/1"); // 4 whole notes
  });

  it("prefers smallest denominator", () => {
    // 1/2 reduces from 2/4, 4/8, etc. — should always pick the smallest
    expect(formatAbsoluteDuration(0.5)).toBe("/2");
    expect(formatAbsoluteDuration(0.25)).toBe("/4");
  });

  it("formats zero", () => {
    expect(formatAbsoluteDuration(0)).toBe("0/1");
  });

  it("spells fine and tuplet note values losslessly (no /64 snap)", () => {
    // Every canonical denominator round-trips exactly — these used to snap to a
    // lossy /64 because the duration list was a strict subset of its siblings.
    expect(formatAbsoluteDuration(1 / 7)).toBe("/7"); // septuplet whole note
    expect(formatAbsoluteDuration(1 / 14)).toBe("/14"); // septuplet half
    expect(formatAbsoluteDuration(1 / 64)).toBe("/64");
    expect(formatAbsoluteDuration(1 / 128)).toBe("/128"); // was lossy → /64 (2x)
    expect(formatAbsoluteDuration(1 / 256)).toBe("/256"); // was lossy → /64 (4x)
    expect(formatAbsoluteDuration(1 / 48)).toBe("/48"); // triplet 32nd
    expect(formatAbsoluteDuration(1 / 96)).toBe("/96");
    expect(formatAbsoluteDuration(1 / 40)).toBe("/40"); // quintuplet 32nd
  });

  it("spells genuinely off-grid values with the lossless decimal escape", () => {
    // A value with no exact note-value fraction at any canonical denominator
    // (only ever produced by measuring a sample-derived length) uses the
    // decimal-numerator escape `<beats>/4` instead of snapping to a wrong note
    // value. 1/9 whole note = 4/9 Ableton beats ≈ 0.4444, so it spells as
    // "0.4444/4" (the caller prepends `n` → `n0.4444/4`), which the widened
    // note/`@step`/offset grammars parse back losslessly.
    expect(formatAbsoluteDuration(1 / 9)).toBe("0.4444/4");
  });
});

describe("formatOffGridBeats", () => {
  it("renders integers without a decimal point", () => {
    expect(formatOffGridBeats(0)).toBe("0");
    expect(formatOffGridBeats(2)).toBe("2");
  });

  it("keeps a decimal to 4-place precision, trimming trailing zeros", () => {
    expect(formatOffGridBeats(1.9638)).toBe("1.9638");
    expect(formatOffGridBeats(0.5)).toBe("0.5");
    expect(formatOffGridBeats(1.25)).toBe("1.25");
    expect(formatOffGridBeats(4 / 9)).toBe("0.4444"); // 0.4444… → 0.4444
  });
});

describe("formatDecimal", () => {
  it("formats integers without decimals", () => {
    expect(formatDecimal(0)).toBe("0");
    expect(formatDecimal(1)).toBe("1");
    expect(formatDecimal(100)).toBe("100");
  });

  it("removes trailing zeros", () => {
    expect(formatDecimal(1.5)).toBe("1.5");
    expect(formatDecimal(1.25)).toBe("1.25");
    expect(formatDecimal(0.5)).toBe("0.5");
  });

  it("limits to 3 decimal places", () => {
    expect(formatDecimal(1 / 3)).toBe("0.333");
    expect(formatDecimal(2 / 3)).toBe("0.667");
  });
});
