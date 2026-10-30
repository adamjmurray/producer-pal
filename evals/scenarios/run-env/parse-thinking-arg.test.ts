// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { describeThinking, parseThinkingArgs } from "./parse-thinking-arg.ts";

const LUNA: ModelSpec = { provider: "codex-code", model: "luna" };
const SOL: ModelSpec = { provider: "openai", model: "gpt-6.1-sol" };
const CLAUDE: ModelSpec = { provider: "claude-code", model: "sonnet" };
const LOCAL: ModelSpec = { provider: "local", model: "qwen3.8" };
const GEMINI: ModelSpec = { provider: "google", model: "gemini-3.8-flash" };

describe("parseThinkingArgs", () => {
  it("sends nothing when no --thinking was given", () => {
    expect(parseThinkingArgs([], [LUNA, SOL]).size).toBe(0);
  });

  it("applies a bare level to every model", () => {
    expect([...parseThinkingArgs(["high"], [LUNA, SOL])]).toStrictEqual([
      ["codex-code/luna", "high"],
      ["openai/gpt-6.1-sol", "high"],
    ]);
  });

  it("applies a per-model level to that model only", () => {
    expect([
      ...parseThinkingArgs(["codex-code/luna=high"], [LUNA, SOL]),
    ]).toStrictEqual([["codex-code/luna", "high"]]);
  });

  it("lets a per-model level override the all-models one", () => {
    const result = parseThinkingArgs(
      ["low,codex-code/luna=ultra"],
      [LUNA, SOL],
    );

    expect(result.get("codex-code/luna")).toBe("ultra");
    expect(result.get("openai/gpt-6.1-sol")).toBe("low");
  });

  it("collects repeated flags and comma lists alike", () => {
    const result = parseThinkingArgs(
      ["codex-code/luna=low", "openai/gpt-6.1-sol=off, "],
      [LUNA, SOL],
    );

    expect(result.get("codex-code/luna")).toBe("low");
    expect(result.get("openai/gpt-6.1-sol")).toBe("off");
  });

  it("normalizes the model key the way -m does", () => {
    const result = parseThinkingArgs(["gpt-6.1-sol=high"], [LUNA, SOL]);

    expect([...result.keys()]).toStrictEqual(["openai/gpt-6.1-sol"]);
  });

  it("rejects a model key that is not one of the -m models", () => {
    expect(() =>
      parseThinkingArgs(["codex-code/sol=high"], [LUNA, SOL]),
    ).toThrow(/codex-code\/sol is not one of the -m models/);
  });

  it("rejects a key whose provider is unknown", () => {
    expect(() => parseThinkingArgs(["nope/x=high"], [LUNA])).toThrow(
      /Unknown provider: nope/,
    );
  });

  it("rejects a level that does not exist", () => {
    expect(() => parseThinkingArgs(["extreme"], [SOL])).toThrow(
      /unknown level "extreme"/,
    );
    expect(() =>
      parseThinkingArgs(["openai/gpt-6.1-sol=extreme"], [SOL]),
    ).toThrow(/unknown level "extreme"/);
  });

  it("rejects a level given twice for the same target", () => {
    expect(() => parseThinkingArgs(["low,high"], [SOL])).toThrow(
      /more than one level for every model/,
    );
    expect(() =>
      parseThinkingArgs(["openai/gpt-6.1-sol=low,gpt-6.1-sol=high"], [SOL]),
    ).toThrow(/more than one level for openai\/gpt-6.1-sol/);
  });

  it("rejects a level an agent CLI can't express, naming what it takes", () => {
    expect(() => parseThinkingArgs(["off"], [LUNA])).toThrow(
      /off can't be set for codex-code\/luna.*low, medium, high, ultra/,
    );
    expect(() =>
      parseThinkingArgs(["claude-code/sonnet=off"], [CLAUDE]),
    ).toThrow(/claude CLI/);
  });

  it("skips the CLI check for a model its own level overrides", () => {
    const result = parseThinkingArgs(["off,codex-code/luna=low"], [LUNA, SOL]);

    expect(result.get("codex-code/luna")).toBe("low");
    expect(result.get("openai/gpt-6.1-sol")).toBe("off");
  });

  it("rejects thinking for a local model", () => {
    expect(() => parseThinkingArgs(["high"], [LOCAL])).toThrow(
      /local models have no thinking setting/,
    );
  });

  it("takes a token budget for google only", () => {
    expect(
      parseThinkingArgs(["4096"], [GEMINI]).get("google/gemini-3.8-flash"),
    ).toBe("4096");
    expect(() => parseThinkingArgs(["4096"], [SOL])).toThrow(
      /token budget is for google models only/,
    );
  });
});

describe("describeThinking", () => {
  it("lists model=level pairs", () => {
    expect(
      describeThinking(
        parseThinkingArgs(["high,codex-code/luna=low"], [LUNA, SOL]),
      ),
    ).toBe("codex-code/luna=low, openai/gpt-6.1-sol=high");
  });
});
