// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEFAULT_NOTATION, isNotation, NOTATIONS } from "../notation.ts";

describe("isNotation", () => {
  it("accepts every supported notation", () => {
    for (const notation of NOTATIONS) {
      expect(isNotation(notation)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isNotation("not-a-notation")).toBe(false);
    expect(isNotation("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isNotation(undefined)).toBe(false);
    expect(isNotation(null)).toBe(false);
    expect(isNotation(123)).toBe(false);
    expect(isNotation({ notation: "barbeat" })).toBe(false);
  });
});

describe("notation constants", () => {
  it("uses barbeat as the default and includes it in the list", () => {
    expect(DEFAULT_NOTATION).toBe("barbeat");
    expect(NOTATIONS).toContain(DEFAULT_NOTATION);
  });
});
