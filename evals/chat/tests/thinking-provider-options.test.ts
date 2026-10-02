// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
    ).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
