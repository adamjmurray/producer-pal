// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for model pricing lookup and cost computation.
 */

import { describe, expect, it } from "vitest";
import { computeCostUsd, lookupPricing } from "../model-pricing.ts";

describe("lookupPricing", () => {
  it("matches a known model by substring", () => {
    expect(lookupPricing("anthropic/claude-sonnet-4-5")).toStrictEqual({
      inputPer1M: 3,
      outputPer1M: 15,
    });
  });

  it("prefers the longest matching key (gpt-5-nano over gpt-5)", () => {
    expect(lookupPricing("openai/gpt-5-nano")?.inputPer1M).toBe(0.05);
    expect(lookupPricing("openai/gpt-5")?.inputPer1M).toBe(1.25);
  });

  it("treats local models as free", () => {
    expect(lookupPricing("local/qwen3:8b")).toStrictEqual({
      inputPer1M: 0,
      outputPer1M: 0,
    });
  });

  it("returns null for unknown models", () => {
    expect(lookupPricing("openai/totally-unknown-xyz")).toBeNull();
  });

  it("applies overrides over defaults", () => {
    const pricing = lookupPricing("anthropic/claude-sonnet-4-5", {
      "claude-sonnet": { inputPer1M: 99, outputPer1M: 1 },
    });

    expect(pricing?.inputPer1M).toBe(99);
  });
});

describe("computeCostUsd", () => {
  it("computes cost from per-1M-token prices", () => {
    const cost = computeCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: 1_500_000 },
      { inputPer1M: 3, outputPer1M: 10 },
    );

    // 1 * 3 + 0.5 * 10 = 8
    expect(cost).toBeCloseTo(8, 6);
  });

  it("is zero for zero usage", () => {
    const cost = computeCostUsd(
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      { inputPer1M: 3, outputPer1M: 10 },
    );

    expect(cost).toBe(0);
  });
});
