// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";
import { parseOutputTokens } from "./parse-output-tokens.ts";

describe("parseOutputTokens", () => {
  it("parses a positive whole number", () => {
    expect(parseOutputTokens("32768")).toBe(32768);
  });

  it.each(["0", "-5", "1.5", "abc", "", "10k"])("rejects %j", (value) => {
    expect(() => parseOutputTokens(value)).toThrow(InvalidArgumentError);
  });
});
