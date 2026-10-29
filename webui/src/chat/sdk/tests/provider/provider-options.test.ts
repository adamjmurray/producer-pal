// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";

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

  it("turns thinking off with the type each model accepts", () => {
    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-sonnet-5.5"),
    ).toStrictEqual({
      ...caching,
      anthropic: { thinking: { type: "between_tools" } },
    });
    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-haiku-5.5"),
    ).toStrictEqual({
      ...caching,
      anthropic: { thinking: { type: "disabled" } },
    });
  });

  it("asks always-on Claude models for the lowest effort when Off", () => {
    const low = { ...caching, anthropic: { effort: "low" } };

    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-fable-5"),
    ).toStrictEqual(low);
    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-opus-5.5"),
    ).toStrictEqual(low);
    expect(
      buildProviderOptions("anthropic", "Off", "claude-opus-5-5"),
    ).toStrictEqual({ anthropic: { effort: "low" } });
    expect(
      buildProviderOptions("anthropic", "Off", "claude-fable-5-1"),
    ).toStrictEqual({ anthropic: { effort: "low" } });
  });

  it("uses adaptive thinking for Haiku 5.5", () => {
    expect(
      buildProviderOptions("vercel", "Max", "anthropic/claude-haiku-5.5"),
    ).toStrictEqual({
      ...caching,
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "max",
      },
    });
  });

  it("keeps legacy budget thinking for Haiku 4.5", () => {
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

  it("turns reasoning off for OpenAI and down for Google when Off", () => {
    expect(
      buildProviderOptions("vercel", "Off", "openai/gpt-6-luna"),
    ).toStrictEqual({ ...caching, openai: { reasoningEffort: "none" } });
    expect(
      buildProviderOptions("vercel", "Off", "google/gemini-3.8-flash"),
    ).toStrictEqual({
      ...caching,
      google: { thinkingConfig: { thinkingLevel: "low" } },
    });
    expect(
      buildProviderOptions("vercel", "Off", "google/gemini-2.5-flash"),
    ).toStrictEqual({
      ...caching,
      google: { thinkingConfig: { thinkingBudget: 0 } },
    });
    expect(
      buildProviderOptions("vercel", "Off", "google/gemini-2.5-pro"),
    ).toStrictEqual(caching);
  });

  it("keeps OpenAI reasoning low rather than none for 6.1 Sol, which rejects none", () => {
    expect(
      buildProviderOptions("vercel", "Off", "openai/gpt-6.1-sol"),
    ).toStrictEqual({ ...caching, openai: { reasoningEffort: "low" } });
  });

  it("sends only caching for a legacy non-thinking Anthropic model", () => {
    expect(
      buildProviderOptions("vercel", "Off", "anthropic/claude-3-haiku"),
    ).toStrictEqual(caching);
  });

  it("sends only caching for a model id with no upstream prefix", () => {
    expect(
      buildProviderOptions("vercel", "Max", "claude-sonnet-5.5"),
    ).toStrictEqual(caching);
  });

  it("sends only caching for other upstreams", () => {
    expect(buildProviderOptions("vercel", "Max", "zai/glm-5.3")).toStrictEqual(
      caching,
    );
  });
});

describe("buildProviderOptions for Ollama", () => {
  it("sends nothing at Default", () => {
    expect(
      buildProviderOptions("ollama", "Default", "qwen3.8"),
    ).toBeUndefined();
  });

  it("sends nothing at Max and none at Off", () => {
    expect(buildProviderOptions("ollama", "Max", "qwen3.8")).toBeUndefined();
    expect(buildProviderOptions("ollama", "Off", "qwen3.8")).toStrictEqual({
      openai: { reasoningEffort: "none" },
    });
  });
});

describe("buildProviderOptions for Gemini", () => {
  it("turns thinking down by model version when Off", () => {
    expect(
      buildProviderOptions("gemini", "Off", "gemini-3.8-flash"),
    ).toStrictEqual({ google: { thinkingConfig: { thinkingLevel: "low" } } });
    expect(
      buildProviderOptions("gemini", "Off", "gemini-2.5-flash"),
    ).toStrictEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
  });

  it("sends nothing when Off for models that can't turn thinking off or unknown ids", () => {
    expect(
      buildProviderOptions("gemini", "Off", "gemini-2.5-pro"),
    ).toBeUndefined();
    expect(buildProviderOptions("gemini", "Off", "my-model")).toBeUndefined();
  });
});

describe("buildProviderOptions for OpenAI summaries", () => {
  it("drops the reasoning summary when Off, on the direct route only", () => {
    expect(buildProviderOptions("openai", "Off", "gpt-6-astra")).toStrictEqual({
      openai: { reasoningEffort: "low", reasoningSummary: null },
    });
    expect(
      buildProviderOptions("vercel", "Off", "openai/gpt-6-astra"),
    ).toStrictEqual({ ...caching, openai: { reasoningEffort: "low" } });
  });
});

describe("buildProviderOptions for OpenRouter", () => {
  it("asks for no reasoning when Off; the request rewrite settles it per model", () => {
    expect(
      buildProviderOptions("openrouter", "Off", "deepseek/deepseek-v4.1-flash"),
    ).toStrictEqual({ openrouter: { reasoning: { effort: "none" } } });
  });
});
