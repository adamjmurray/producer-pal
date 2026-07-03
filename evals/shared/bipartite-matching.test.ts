// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { hasPerfectMatching } from "#evals/shared/bipartite-matching.ts";

/**
 * A left item matches a right "any-of" set when the set contains it.
 * @param value - Left item
 * @param set - Right any-of set
 * @returns True when the set contains the value
 */
const inSet = (value: number, set: number[]): boolean => set.includes(value);

describe("hasPerfectMatching", () => {
  it("matches disjoint one-to-one pairs", () => {
    expect(hasPerfectMatching([1, 2], [[1], [2]], inSet)).toBe(true);
  });

  it("finds a valid assignment a greedy index-pairing would miss", () => {
    // The notesMatch failure: actual {45,50} vs expected any-of [40,50] and [45].
    // Greedy pairs 45↔[40,50] and fails; the matching finds 50↔[40,50], 45↔[45].
    expect(hasPerfectMatching([45, 50], [[40, 50], [45]], inSet)).toBe(true);
  });

  it("reassigns an already-matched right item along an augmenting path", () => {
    // Left 1 first claims [1,2]; left 2 forces it onto [1] so 2 can take [1,2].
    expect(hasPerfectMatching([1, 2], [[1, 2], [1]], inSet)).toBe(true);
  });

  it("returns false when two left items compete for the only match", () => {
    expect(hasPerfectMatching([1, 2], [[1], [1]], inSet)).toBe(false);
  });

  it("returns false when a left item pairs with nothing", () => {
    expect(hasPerfectMatching([1], [[2]], inSet)).toBe(false);
  });

  it("matches empty sets vacuously", () => {
    expect(hasPerfectMatching<number, number[]>([], [], inSet)).toBe(true);
  });
});
