// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildProviderOptions } from "#webui/chat/sdk/provider-options";

const caching = { gateway: { caching: "auto" } };

describe("buildProviderOptions for the Vercel gateway", () => {
  it("asks Anthropic for summarized adaptive thinking", () => {
    expect(
      buildProviderOptions("vercel", "Max", "anthropic/claude-sonnet-5.5"),
    ).toStrictEqual({
      ...caching,
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "max",
      },
    });
  });

  it("disables thinking for Off on adaptive-by-default models only", () => {
    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-sonnet-5.5"),
    ).toStrictEqual({
      ...caching,
      anthropic: { thinking: { type: "disabled" } },
    });
    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-fable-5"),
    ).toStrictEqual(caching);
  });

  it("keeps legacy budget thinking for Haiku", () => {
    expect(
      buildProviderOptions("vercel", "Max", "anthropic/claude-haiku-4.5"),
    ).toStrictEqual({
      ...caching,
      anthropic: { thinking: { type: "enabled", budgetTokens: 16384 } },
    });
  });

  it("uses the OpenAI and Google options for those upstreams", () => {
    expect(
      buildProviderOptions("vercel", "Default", "openai/gpt-6-luna"),
    ).toStrictEqual({
      ...caching,
      openai: { reasoningEffort: "medium", reasoningSummary: "auto" },
    });
    expect(
      buildProviderOptions("vercel", "Default", "google/gemini-3.8-flash"),
    ).toStrictEqual({
      ...caching,
      google: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } },
    });
  });

  it("sends only caching for other upstreams", () => {
    expect(buildProviderOptions("vercel", "Max", "zai/glm-5.3")).toStrictEqual(
      caching,
    );
  });
});
