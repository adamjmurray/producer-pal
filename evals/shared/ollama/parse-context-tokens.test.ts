// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";
import { parseContextTokens } from "./parse-context-tokens.ts";

describe("parseContextTokens", () => {
  it("accepts a plain positive integer", () => {
    expect(parseContextTokens("65536")).toBe(65536);
    expect(parseContextTokens("1")).toBe(1);
  });

  it.each([
    "64k",
    "0",
    "-5",
    "1.5",
    "",
    " 8",
    "1e3",
    "abc",
    "00",
    "99999999999999999999",
  ])("rejects %j", (value) => {
    expect(() => parseContextTokens(value)).toThrow(InvalidArgumentError);
  });
});
