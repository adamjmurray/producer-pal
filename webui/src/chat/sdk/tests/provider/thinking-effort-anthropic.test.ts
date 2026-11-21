// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildAnthropicProviderOptions,
  getThinkingOffType,
  isAlwaysOnThinkingModel,
  isLegacyNonThinkingModel,
  isLegacyThinkingModel,
} from "#webui/chat/sdk/provider/thinking-effort";

describe("getThinkingOffType", () => {
  it.each([
    ["claude-sonnet-5-5", "between_tools"],
    ["claude-sonnet-5.5", "between_tools"],
    ["claude-haiku-5-5", "disabled"],
    ["claude-haiku-4-5", undefined],
    ["claude-sonnet-4-6", "disabled"],
    ["claude-opus-5-5", undefined],
    ["claude-opus-5.5", undefined],
    ["claude-fable-5-1", undefined],
    ["claude-mythos-5", undefined],
    ["claude-3-5-sonnet-20241022", undefined],
  ])("for %s is %s", (model, expected) => {
    expect(getThinkingOffType(model)).toBe(expected);
  });
});

describe("isAlwaysOnThinkingModel", () => {
  it("is true for Opus 5.5 under either id spelling", () => {
    expect(isAlwaysOnThinkingModel("claude-opus-5-5")).toBe(true);
    expect(isAlwaysOnThinkingModel("claude-opus-5.5")).toBe(true);
  });

  it("is true for Fable and Mythos models", () => {
    expect(isAlwaysOnThinkingModel("claude-fable-5-1")).toBe(true);
    expect(isAlwaysOnThinkingModel("claude-mythos-5")).toBe(true);
  });

  it("is false for other models", () => {
    expect(isAlwaysOnThinkingModel("claude-sonnet-5-5")).toBe(false);
    expect(isAlwaysOnThinkingModel("claude-haiku-4-5")).toBe(false);
  });
});

describe("isLegacyNonThinkingModel", () => {
  it("is true for Claude 3.0 / 3.5 and Claude 2 / instant ids", () => {
    expect(isLegacyNonThinkingModel("claude-3-opus-20240229")).toBe(true);
    expect(isLegacyNonThinkingModel("claude-3-sonnet-20240229")).toBe(true);
    expect(isLegacyNonThinkingModel("claude-3-5-sonnet-20241022")).toBe(true);
    expect(isLegacyNonThinkingModel("claude-3.5-sonnet")).toBe(true);
    expect(isLegacyNonThinkingModel("claude-2.1")).toBe(true);
    expect(isLegacyNonThinkingModel("claude-instant-1.2")).toBe(true);
  });

  it("is false for 3.7+ and modern named-tier ids (they support thinking)", () => {
    expect(isLegacyNonThinkingModel("claude-3-7-sonnet")).toBe(false);
    expect(isLegacyNonThinkingModel("claude-sonnet-5-5")).toBe(false);
    expect(isLegacyNonThinkingModel("claude-opus-5-5")).toBe(false);
    expect(isLegacyNonThinkingModel("claude-haiku-4-5")).toBe(false);
  });
});

describe("isLegacyThinkingModel", () => {
  it("is true for Haiku 4.5 ids", () => {
    expect(isLegacyThinkingModel("claude-haiku-4-5")).toBe(true);
    expect(isLegacyThinkingModel("claude-haiku-4-5-20251001")).toBe(true);
    expect(isLegacyThinkingModel("anthropic/claude-haiku-4.5")).toBe(true);
  });

  it("is false for Haiku 5.5, which rejects budget thinking", () => {
    expect(isLegacyThinkingModel("claude-haiku-5-5")).toBe(false);
    expect(isLegacyThinkingModel("anthropic/claude-haiku-5.5")).toBe(false);
  });
});

describe("buildAnthropicProviderOptions", () => {
  const direct = { explicitOff: false, summarized: false };
  const gateway = { explicitOff: true, summarized: true };

  it.each([
    ["low", "low"],
    ["medium", "medium"],
    ["high", "high"],
    ["max", "max"],
  ] as const)("sends adaptive thinking with effort for %s", (level, effort) => {
    expect(
      buildAnthropicProviderOptions(level, "claude-sonnet-5-5", direct),
    ).toStrictEqual({
      anthropic: { thinking: { type: "adaptive" }, effort },
    });
  });

  it("sends adaptive thinking with no effort for auto", () => {
    expect(
      buildAnthropicProviderOptions("auto", "claude-sonnet-5-5", direct),
    ).toStrictEqual({ anthropic: { thinking: { type: "adaptive" } } });
  });

  it("uses a token budget on Haiku 4.5, which 400s on adaptive", () => {
    const enabled = (budgetTokens: number): object => ({
      anthropic: { thinking: { type: "enabled", budgetTokens } },
    });

    expect(
      buildAnthropicProviderOptions("auto", "claude-haiku-4-5", direct),
    ).toStrictEqual(enabled(10240));
    expect(
      buildAnthropicProviderOptions("max", "claude-haiku-4-5", gateway),
    ).toStrictEqual(enabled(16384));
    expect(
      buildAnthropicProviderOptions("off", "claude-haiku-4-5", gateway),
    ).toBeUndefined();
  });

  it("asks for summarized thinking when the route can't rewrite the request", () => {
    expect(
      buildAnthropicProviderOptions("auto", "claude-sonnet-5-5", gateway),
    ).toStrictEqual({
      anthropic: {
        thinking: { type: "adaptive", display: "summarized" },
      },
    });
  });

  it("omits thinking for off on the direct route", () => {
    expect(
      buildAnthropicProviderOptions("off", "claude-sonnet-5-5", direct),
    ).toBeUndefined();
  });

  it.each([
    ["claude-sonnet-5-5", "between_tools"],
    ["claude-haiku-5-5", "disabled"],
  ])("sends the off type for %s when explicit", (model, type) => {
    expect(buildAnthropicProviderOptions("off", model, gateway)).toStrictEqual({
      anthropic: { thinking: { type } },
    });
  });

  it("sends the lowest effort for off on always-on models", () => {
    const low = { anthropic: { effort: "low" } };

    expect(
      buildAnthropicProviderOptions("off", "claude-opus-5-5", direct),
    ).toStrictEqual(low);
    expect(
      buildAnthropicProviderOptions("off", "claude-fable-5-1", gateway),
    ).toStrictEqual(low);
  });

  it("never sends thinking to models that predate it", () => {
    for (const level of ["off", "auto", "max"] as const) {
      expect(
        buildAnthropicProviderOptions(
          level,
          "claude-3-5-sonnet-20241022",
          gateway,
        ),
      ).toBeUndefined();
    }
  });
});
