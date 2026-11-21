// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  getGeminiOffThinkingConfig,
  mapThinkingToOllamaEffort,
} from "#webui/chat/sdk/provider/thinking-effort";

describe("mapThinkingToOllamaEffort", () => {
  it("should return undefined for auto", () => {
    expect(mapThinkingToOllamaEffort("auto")).toBeUndefined();
  });

  it("should map off to none", () => {
    expect(mapThinkingToOllamaEffort("off")).toBe("none");
  });

  it("should send nothing for max", () => {
    expect(mapThinkingToOllamaEffort("max")).toBeUndefined();
  });
});

describe("getGeminiOffThinkingConfig", () => {
  it.each(["gemini-3.8-flash", "gemini-4-argon", "gemini-3.5-flash-lite"])(
    "uses the low thinking level for Gemini 3+ (%s)",
    (model) => {
      expect(getGeminiOffThinkingConfig(model)).toStrictEqual({
        thinkingLevel: "low",
      });
    },
  );

  it.each(["gemini-2.5-flash", "gemini-2.5-flash-lite"])(
    "uses a zero budget for Gemini 2.5 (%s)",
    (model) => {
      expect(getGeminiOffThinkingConfig(model)).toStrictEqual({
        thinkingBudget: 0,
      });
    },
  );

  it.each(["gemini-2.5-pro", "gemini-2.0-flash", "gemini-pro", "gemma-4"])(
    "sends nothing for models that can't turn thinking off (%s)",
    (model) => {
      expect(getGeminiOffThinkingConfig(model)).toBeUndefined();
    },
  );
});
