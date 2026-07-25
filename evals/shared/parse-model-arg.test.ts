// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseModelArg } from "./parse-model-arg.ts";

describe("parseModelArg", () => {
  it("splits an explicit provider/model on the first slash only", () => {
    expect(parseModelArg("claude-code/sonnet")).toStrictEqual({
      provider: "claude-code",
      model: "sonnet",
    });
    expect(
      parseModelArg("openrouter/anthropic/claude-haiku-4.5"),
    ).toStrictEqual({
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
    });
  });

  it("infers the provider from a model prefix", () => {
    expect(parseModelArg("claude-sonnet-4-5")).toStrictEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    });
    expect(parseModelArg("gpt-5-nano").provider).toBe("openai");
    expect(parseModelArg("gemini-3-flash-preview").provider).toBe("google");
  });

  it("rejects a bare provider name rather than inferring from its prefix", () => {
    // `claude-code` is both a provider name and a `claude-` prefix match.
    // Inference used to win, quietly routing someone who asked for the
    // subscription CLI to the metered Anthropic API — where the only symptom
    // was "API key for Anthropic is not set". Every provider must fail the
    // same way its sibling `codex-code` does.
    for (const provider of [
      "claude-code",
      "codex-code",
      "anthropic",
      "local",
    ]) {
      expect(() => parseModelArg(provider)).toThrow(
        `Provider-only not allowed: "${provider}"`,
      );
    }
  });

  it("rejects an unknown prefix and a provider with no model", () => {
    expect(() => parseModelArg("mystery-model")).toThrow(
      /Unknown model prefix/,
    );
    expect(() => parseModelArg("nope/x")).toThrow(/Unknown provider: nope/);
    expect(() => parseModelArg("claude-code/")).toThrow(/Missing model after/);
  });
});
