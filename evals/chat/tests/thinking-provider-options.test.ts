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
      anthropic: { thinking: { type: "adaptive" }, effort: "high" },
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
      buildProviderOptions("anthropic", "off", "claude-sonnet-5-5"),
    ).toStrictEqual({ anthropic: { thinking: { type: "disabled" } } });
  });

  it("sends nothing for off on models that reject a disable", () => {
    expect(
      buildProviderOptions("anthropic", "off", "claude-fable-5-1"),
    ).toBeUndefined();
    expect(
      buildProviderOptions("vercel", "off", "anthropic/claude-mythos-5"),
    ).toBeUndefined();
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
