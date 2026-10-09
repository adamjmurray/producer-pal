// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  findReturnIndex,
  returnTrackPathIndex,
} from "#src/tools/shared/helpers/send-validation.ts";

/**
 * The index findReturnIndex picks
 * @param args - Arguments for findReturnIndex
 * @returns The match's index
 */
function indexOf(...args: Parameters<typeof findReturnIndex>): number {
  return findReturnIndex(...args).index;
}

describe("findReturnIndex", () => {
  const names = ["A-Reverb", "b Delay", "Chorus"];

  it("matches an exact name", () => {
    expect(indexOf(names, "Chorus")).toBe(2);
    expect(indexOf(names, "b Delay")).toBe(1);
  });

  it("matches a letter prefix before '-' or ' ', ignoring case", () => {
    expect(indexOf(names, "a")).toBe(0);
    expect(indexOf(names, "B")).toBe(1);
  });

  it("does not match a name that merely starts with the letter", () => {
    expect(indexOf(names, "C")).toBe(-1);
    expect(indexOf(names, "Rev")).toBe(-1);
  });

  it("matches an exact name ignoring case", () => {
    expect(indexOf(names, "chorus")).toBe(2);
    expect(indexOf(names, "A-REVERB")).toBe(0);
  });

  it("matches nothing for an empty name", () => {
    expect(indexOf(names, "")).toBe(-1);
  });

  it("prefers an exact name over an earlier prefix match", () => {
    expect(indexOf(["Delay 2", "Delay"], "Delay")).toBe(1);
    expect(indexOf(["Reverb Long", "Reverb"], "Reverb")).toBe(1);
    expect(indexOf(["A Reverb", "A"], "A")).toBe(1);
    expect(indexOf(["Delay 2", "delay"], "DELAY")).toBe(1);
  });

  it("falls back to the first prefix match when no name matches exactly", () => {
    expect(indexOf(["A-Reverb", "B-Delay"], "A")).toBe(0);
    expect(indexOf(["A Reverb", "A-Delay"], "A")).toBe(0);
  });

  it("matches an id", () => {
    expect(indexOf(names, "12", ["11", "12", "13"])).toBe(1);
  });

  it("tells two identically named returns apart, which a name can't", () => {
    expect(indexOf(["Verb", "Verb"], "13", ["12", "13"])).toBe(1);
  });

  it("ignores an id belonging to something else", () => {
    expect(indexOf(names, "99", ["11", "12", "13"])).toBe(-1);
  });

  it("matches an id exactly, not by case or prefix", () => {
    expect(indexOf(names, "1", ["11", "12", "13"])).toBe(-1);
  });

  it("keeps a return named after a number reachable by name", () => {
    expect(indexOf(["12", "Delay"], "12", ["7", "8"])).toBe(0);
  });

  it("prefers the id and returns a clash when it also names another return", () => {
    expect(findReturnIndex(["12", "Delay"], "12", ["11", "12"])).toStrictEqual({
      index: 1,
      clash: 'matched by id; "12" is also the name of "12"',
    });
  });

  it("has no clash when the id and the name are the same return", () => {
    expect(findReturnIndex(["12", "Delay"], "12", ["12", "13"])).toStrictEqual({
      index: 0,
    });
  });
});

describe("returnTrackPathIndex", () => {
  it("reads a return track path", () => {
    expect(returnTrackPathIndex("rt0")).toBe(0);
    expect(returnTrackPathIndex(" rt12 ")).toBe(12);
  });

  it("is -1 for anything else", () => {
    for (const value of ["t0", "mt", "rt+", "rt0/d0", "rt", "rtx", "3", "A"]) {
      expect(returnTrackPathIndex(value)).toBe(-1);
    }
  });
});

describe("findReturnIndex with a path", () => {
  const names = ["A-Reverb", "B-Delay"];

  it("uses the path's index", () => {
    expect(indexOf(names, "rt1", [], 1)).toBe(1);
  });

  it("treats a path past the last return as no match", () => {
    expect(indexOf(names, "rt9", [], 9)).toBe(-1);
  });

  it("lets an exact name beat the path, and returns a clash", () => {
    expect(findReturnIndex(["A", "rt0"], "rt0", [], 0)).toStrictEqual({
      index: 1,
      clash: 'matched by name; "rt0" is also a path to "A"',
    });
  });

  it("has no clash when the name and the path are the same return", () => {
    expect(findReturnIndex(["rt0", "B"], "rt0", [], 0)).toStrictEqual({
      index: 0,
    });
  });

  it("lets an id beat the path", () => {
    expect(indexOf(names, "rt0", ["rt0", "x"], 1)).toBe(0);
  });
});

describe("findReturnIndex precedence: id, name, path, prefix", () => {
  it("takes an id over a name, a path and a prefix", () => {
    // "rt1" is return 0's id, return 1's name, and a path to return 1.
    expect(
      indexOf(["rt1-Verb", "rt1", "Other"], "rt1", ["rt1", "x", "y"], 1),
    ).toBe(0);
  });

  it("takes a name over a path", () => {
    expect(indexOf(["A", "rt1", "C"], "rt1", [], 1)).toBe(1);
    expect(indexOf(["rt2", "B", "C"], "rt2", [], 2)).toBe(0);
  });

  it("takes a path over a prefix", () => {
    // "rt0" prefixes "rt0 Verb" (index 1), but it is also a path to index 0.
    expect(indexOf(["A", "rt0 Verb"], "rt0", [], 0)).toBe(0);
  });

  it("takes a name over a prefix of another name", () => {
    expect(indexOf(["Delay 2", "Delay"], "Delay")).toBe(1);
    expect(indexOf(["B Delay", "B"], "b")).toBe(1);
  });

  it("falls to the prefix only when nothing else matches", () => {
    expect(indexOf(["A-Verb", "B-Delay"], "b", ["1", "2"], -1)).toBe(1);
    // A path past the last return is no path, so the prefix still gets a turn.
    expect(indexOf(["rt9 Verb"], "rt9", [], 9)).toBe(0);
  });
});
