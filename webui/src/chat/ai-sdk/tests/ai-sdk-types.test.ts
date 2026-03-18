// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { toTokenUsage } from "#webui/chat/ai-sdk/ai-sdk-types";

/**
 * Create a LanguageModelUsage with sensible defaults.
 * @param overrides - Fields to override
 * @returns LanguageModelUsage with defaults
 */
function makeUsage(
  overrides: Partial<LanguageModelUsage> = {},
): LanguageModelUsage {
  return {
    inputTokens: undefined,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: undefined,
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
    totalTokens: undefined,
    ...overrides,
  };
}

describe("toTokenUsage", () => {
  it("extracts all fields from populated usage", () => {
    const raw = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      outputTokenDetails: { textTokens: 30, reasoningTokens: 20 },
      totalTokens: 150,
    });

    expect(toTokenUsage(raw)).toStrictEqual({
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("converts nullish values to undefined", () => {
    const raw = makeUsage();

    expect(toTokenUsage(raw)).toStrictEqual({
      inputTokens: undefined,
      outputTokens: undefined,
    });
  });
});
