// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { toTokenUsage } from "#webui/chat/sdk/types";

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
      reasoningTokens: 20,
    });
  });

  it("converts nullish values to undefined", () => {
    const raw = makeUsage();

    expect(toTokenUsage(raw)).toStrictEqual({
      inputTokens: undefined,
      outputTokens: undefined,
    });
  });

  it("omits zero reasoning tokens", () => {
    const raw = makeUsage({
      inputTokens: 100,
      outputTokens: 15,
      outputTokenDetails: { textTokens: 15, reasoningTokens: 0 },
    });

    expect(toTokenUsage(raw)).toStrictEqual({
      inputTokens: 100,
      outputTokens: 15,
    });
  });

  it("extracts cache read/write tokens when present", () => {
    const raw = makeUsage({
      inputTokens: 1200,
      outputTokens: 40,
      inputTokenDetails: {
        noCacheTokens: 200,
        cacheReadTokens: 900,
        cacheWriteTokens: 100,
      },
    });

    expect(toTokenUsage(raw)).toStrictEqual({
      inputTokens: 1200,
      outputTokens: 40,
      cacheReadTokens: 900,
      cacheWriteTokens: 100,
    });
  });

  it("omits zero cache tokens", () => {
    const raw = makeUsage({
      inputTokens: 100,
      outputTokens: 15,
      inputTokenDetails: {
        noCacheTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });

    expect(toTokenUsage(raw)).toStrictEqual({
      inputTokens: 100,
      outputTokens: 15,
    });
  });
});
