// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProviderOptions } from "#evals/chat/thinking-provider-options.ts";

describe("buildProviderOptions for the Vercel gateway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the upstream provider's options from the model id", () => {
    expect(
      buildProviderOptions("vercel", "high", "anthropic/claude-sonnet-5.5"),
    ).toStrictEqual({
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
        effort: "high",
      },
    });
    expect(
      buildProviderOptions("vercel", "low", "openai/gpt-6-luna"),
    ).toStrictEqual({ openai: { reasoningEffort: "low" } });
    expect(
      buildProviderOptions("vercel", "2048", "google/gemini-3.8-flash"),
    ).toStrictEqual({
      google: {
        thinkingConfig: { thinkingBudget: 2048, includeThoughts: true },
      },
    });
  });

  it("warns when an upstream provider has no mapping", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      buildProviderOptions("vercel", "high", "spacexai/grok-5"),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("--thinking high ignored"),
    );
  });

  it("does not warn when thinking is off", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      buildProviderOptions("vercel", "off", "anthropic/claude-sonnet-5.5"),
    ).toStrictEqual({ anthropic: { thinking: { type: "between_tools" } } });
    expect(
      buildProviderOptions("vercel", "off", "anthropic/claude-haiku-5.5"),
    ).toStrictEqual({ anthropic: { thinking: { type: "disabled" } } });
    expect(
      buildProviderOptions("vercel", "off", "spacexai/grok-5"),
    ).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("buildProviderOptions for Anthropic", () => {
  it("sends adaptive thinking with an effort level", () => {
    expect(
      buildProviderOptions("anthropic", "ultra", "claude-sonnet-5-5"),
    ).toStrictEqual({
      anthropic: { thinking: { type: "adaptive" }, effort: "max" },
    });
  });

  it("sends an explicit disable for off", () => {
    expect(
      buildProviderOptions("anthropic", "off", "claude-haiku-5-5"),
    ).toStrictEqual({ anthropic: { thinking: { type: "disabled" } } });
  });

  it("sends between_tools for off on models that reject disabled", () => {
    expect(
      buildProviderOptions("anthropic", "off", "claude-sonnet-5-5"),
    ).toStrictEqual({ anthropic: { thinking: { type: "between_tools" } } });
  });

  it("sends the lowest effort for off on always-on models", () => {
    const low = { anthropic: { effort: "low" } };

    expect(
      buildProviderOptions("anthropic", "off", "claude-fable-5-1"),
    ).toStrictEqual(low);
    expect(
      buildProviderOptions("anthropic", "off", "claude-opus-5-5"),
    ).toStrictEqual(low);
    expect(
      buildProviderOptions("vercel", "off", "anthropic/claude-mythos-5"),
    ).toStrictEqual(low);
    expect(
      buildProviderOptions("vercel", "off", "anthropic/claude-opus-5.5"),
    ).toStrictEqual(low);
  });

  it("sends nothing when thinking is unset or not a named level", () => {
    expect(
      buildProviderOptions("anthropic", undefined, "claude-sonnet-5-5"),
    ).toBeUndefined();
    expect(
      buildProviderOptions("anthropic", "4096", "claude-sonnet-5-5"),
    ).toBeUndefined();
  });
});

describe("buildProviderOptions for OpenAI", () => {
  it("sends the lowest effort a GPT-6 model accepts for off", () => {
    expect(buildProviderOptions("openai", "off", "gpt-6-luna")).toStrictEqual({
      openai: { reasoningEffort: "none" },
    });
    expect(buildProviderOptions("openai", "off", "gpt-6.1-sol")).toStrictEqual({
      openai: { reasoningEffort: "low" },
    });
    expect(
      buildProviderOptions("vercel", "off", "openai/gpt-6-astra"),
    ).toStrictEqual({ openai: { reasoningEffort: "low" } });
  });

  it("sends max for ultra on GPT-6", () => {
    expect(
      buildProviderOptions("openai", "ultra", "gpt-6.1-sol"),
    ).toStrictEqual({ openai: { reasoningEffort: "max" } });
  });

  it("sends nothing for off on GPT-5 and models without reasoning effort", () => {
    expect(buildProviderOptions("openai", "off", "gpt-5.4")).toBeUndefined();
    expect(buildProviderOptions("openai", "high", "gpt-4o")).toBeUndefined();
  });

  it("sends xhigh for ultra where the model supports it", () => {
    expect(buildProviderOptions("openai", "ultra", "gpt-5.4")).toStrictEqual({
      openai: { reasoningEffort: "xhigh" },
    });
  });
});

describe("buildProviderOptions for Gemini", () => {
  it("sends a low thinking level for off on Gemini 3+", () => {
    const low = { google: { thinkingConfig: { thinkingLevel: "low" } } };

    expect(
      buildProviderOptions("google", "off", "gemini-3.8-flash"),
    ).toStrictEqual(low);
    expect(
      buildProviderOptions("vercel", "off", "google/gemini-3.8-flash"),
    ).toStrictEqual(low);
  });

  it("sends a zero budget for off on Gemini 2.5 except Pro", () => {
    expect(
      buildProviderOptions("google", "off", "gemini-2.5-flash"),
    ).toStrictEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
    expect(
      buildProviderOptions("google", "off", "gemini-2.5-pro"),
    ).toBeUndefined();
  });

  it("treats a zero token budget like off", () => {
    expect(
      buildProviderOptions("google", "0", "gemini-3.8-flash"),
    ).toStrictEqual({ google: { thinkingConfig: { thinkingLevel: "low" } } });
  });

  it("still sends a budget for other levels", () => {
    expect(
      buildProviderOptions("google", "medium", "gemini-2.5-pro"),
    ).toStrictEqual({
      google: {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      },
    });
  });
});

describe("buildProviderOptions for OpenRouter", () => {
  it("sends effort none for off", () => {
    expect(
      buildProviderOptions("openrouter", "off", "deepseek/deepseek-v4.1-flash"),
    ).toStrictEqual({ openrouter: { reasoning: { effort: "none" } } });
  });

  it("sends the named effort for other levels", () => {
    expect(
      buildProviderOptions(
        "openrouter",
        "ultra",
        "deepseek/deepseek-v4.1-flash",
      ),
    ).toStrictEqual({ openrouter: { reasoning: { effort: "xhigh" } } });
  });
});

describe("buildProviderOptions for the local provider", () => {
  it("sends reasoning effort none for off", () => {
    expect(buildProviderOptions("local", "off", "qwen3.8")).toStrictEqual({
      local: { reasoningEffort: "none" },
    });
  });

  it("sends nothing for other levels or when unset", () => {
    expect(buildProviderOptions("local", "ultra", "qwen3.8")).toBeUndefined();
    expect(buildProviderOptions("local", undefined, "qwen3.8")).toBeUndefined();
  });
});
