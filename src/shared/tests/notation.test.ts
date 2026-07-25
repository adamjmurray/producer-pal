// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTATION,
  isNotation,
  NOTATION_HEADER,
  NOTATIONS,
  resolveNotation,
} from "../notation.ts";

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

describe("NOTATION_HEADER", () => {
  it("is lowercase (HTTP header names are case-insensitive; req.get matches)", () => {
    expect(NOTATION_HEADER).toBe(NOTATION_HEADER.toLowerCase());
  });
});

describe("resolveNotation", () => {
  it("uses the header value when it names a supported notation", () => {
    for (const notation of NOTATIONS) {
      expect(resolveNotation(notation, "barbeat")).toBe(notation);
    }
  });

  it("falls back to the global when the header is absent", () => {
    // What keeps external MCP clients on the device's notation setting.
    expect(resolveNotation(undefined, "stark")).toBe("stark");
  });

  it("falls back to the global for unrecognized values", () => {
    // A stray header must not wedge the request into an invalid notation.
    expect(resolveNotation("tablature", "midi-json")).toBe("midi-json");
    expect(resolveNotation("", "barbeat")).toBe("barbeat");
    expect(resolveNotation("BarBeat", "barbeat")).toBe("barbeat");
  });
});
