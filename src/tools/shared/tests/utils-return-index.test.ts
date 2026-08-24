// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import { findReturnIndex } from "#src/tools/shared/utils.ts";

describe("findReturnIndex", () => {
  const names = ["A-Reverb", "b Delay", "Chorus"];

  it("matches an exact name", () => {
    expect(findReturnIndex(names, "Chorus")).toBe(2);
    expect(findReturnIndex(names, "b Delay")).toBe(1);
  });

  it("matches a letter prefix before '-' or ' ', ignoring case", () => {
    expect(findReturnIndex(names, "a")).toBe(0);
    expect(findReturnIndex(names, "B")).toBe(1);
  });

  it("does not match a name that merely starts with the letter", () => {
    expect(findReturnIndex(names, "C")).toBe(-1);
    expect(findReturnIndex(names, "Rev")).toBe(-1);
  });

  it("matches an exact name ignoring case", () => {
    expect(findReturnIndex(names, "chorus")).toBe(2);
    expect(findReturnIndex(names, "A-REVERB")).toBe(0);
  });

  it("matches nothing for an empty name", () => {
    expect(findReturnIndex(names, "")).toBe(-1);
  });

  it("prefers an exact name over an earlier prefix match", () => {
    expect(findReturnIndex(["Delay 2", "Delay"], "Delay")).toBe(1);
    expect(findReturnIndex(["Reverb Long", "Reverb"], "Reverb")).toBe(1);
    expect(findReturnIndex(["A Reverb", "A"], "A")).toBe(1);
    expect(findReturnIndex(["Delay 2", "delay"], "DELAY")).toBe(1);
  });

  it("falls back to the first prefix match when no name matches exactly", () => {
    expect(findReturnIndex(["A-Reverb", "B-Delay"], "A")).toBe(0);
    expect(findReturnIndex(["A Reverb", "A-Delay"], "A")).toBe(0);
  });

  it("matches an id", () => {
    expect(findReturnIndex(names, "12", ["11", "12", "13"])).toBe(1);
  });

  it("tells two identically named returns apart, which a name can't", () => {
    expect(findReturnIndex(["Verb", "Verb"], "13", ["12", "13"])).toBe(1);
  });

  it("ignores an id belonging to something else", () => {
    expect(findReturnIndex(names, "99", ["11", "12", "13"])).toBe(-1);
  });

  it("matches an id exactly, not by case or prefix", () => {
    expect(findReturnIndex(names, "1", ["11", "12", "13"])).toBe(-1);
  });

  it("keeps a return named after a number reachable by name", () => {
    expect(findReturnIndex(["12", "Delay"], "12", ["7", "8"])).toBe(0);
  });

  it("prefers the id and says so when it also names another return", () => {
    expect(findReturnIndex(["12", "Delay"], "12", ["11", "12"])).toBe(1);

    expect(consoleMock.warn).toHaveBeenCalledWith(
      'sendReturn "12" is the id of "Delay" and the name of another return; using the id',
    );
  });
});
