// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  estimateTokensFromChars,
} from "#webui/utils/token-estimate";

describe("estimateTokens", () => {
  it("is 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("is 1 for exactly one token's worth of characters", () => {
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("rounds up a partial token", () => {
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("scales linearly with length", () => {
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });
});

describe("estimateTokensFromChars", () => {
  it("is 0 for zero characters", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
  });

  it("rounds a partial token up", () => {
    expect(estimateTokensFromChars(5)).toBe(2);
  });

  it("matches estimateTokens for the same length", () => {
    const text = "hello world, this is some markdown";

    expect(estimateTokensFromChars(text.length)).toBe(estimateTokens(text));
  });
});
