// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { NOTE_VALUE_DENOMINATORS } from "#src/notation/barbeat/barbeat-config.ts";
import { BEAT_OFFSET_DENOMINATORS } from "#src/notation/barbeat/serializer/helpers/barbeat-serializer-fractions.ts";
import { DURATION_DENOMINATOR_CANDIDATES } from "#src/notation/barbeat/time/barbeat-time.ts";

// Lock the per-surface note-value denominator lists to the single canonical set.
// They MAY be subsets (each surface emits a different slice for good reasons —
// see the comments at each list), but none may reference a denominator the
// canonical set does not declare. This is the divergence-lock that prevents F1's
// root cause from recurring: a serializer list silently omitting denominators its
// siblings emit, so representable note values round-trip-corrupt to /64.

describe("note-value denominator parity", () => {
  const canonical = new Set(NOTE_VALUE_DENOMINATORS);

  it("the canonical set has no duplicates and only positive integers", () => {
    expect(canonical.size).toBe(NOTE_VALUE_DENOMINATORS.length);

    for (const d of NOTE_VALUE_DENOMINATORS) {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
  });

  it("DURATION_DENOMINATOR_CANDIDATES (length read-back) ⊆ canonical", () => {
    for (const d of DURATION_DENOMINATOR_CANDIDATES) {
      expect(canonical.has(d)).toBe(true);
    }
  });

  it("BEAT_OFFSET_DENOMINATORS (position offsets) ⊆ canonical", () => {
    for (const d of BEAT_OFFSET_DENOMINATORS) {
      expect(canonical.has(d)).toBe(true);
    }
  });

  it("every canonical denominator yields a grammar-valid token shape", () => {
    // The grammars accept any [1-9][0-9]* denominator; assert the contract so a
    // future canonical addition can't introduce an un-authorable denominator.
    for (const d of NOTE_VALUE_DENOMINATORS) {
      expect(String(d)).toMatch(/^[1-9]\d*$/);
    }
  });
});
