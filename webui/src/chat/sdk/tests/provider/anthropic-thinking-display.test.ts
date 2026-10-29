// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type AnthropicRequestBody } from "#webui/chat/sdk/provider/anthropic-cache-control";
import { summarizeAdaptiveThinking } from "#webui/chat/sdk/provider/anthropic-thinking-display";

describe("summarizeAdaptiveThinking", () => {
  it("adds display to adaptive thinking", () => {
    const body: AnthropicRequestBody = { thinking: { type: "adaptive" } };

    expect(summarizeAdaptiveThinking(body)).toBe(true);
    expect(body.thinking).toStrictEqual({
      type: "adaptive",
      display: "summarized",
    });
  });

  it("leaves an existing display, other types and no thinking alone", () => {
    const shown: AnthropicRequestBody = {
      thinking: { type: "adaptive", display: "omitted" },
    };

    expect(summarizeAdaptiveThinking(shown)).toBe(false);
    expect(shown.thinking?.display).toBe("omitted");
    expect(summarizeAdaptiveThinking({ thinking: { type: "enabled" } })).toBe(
      false,
    );
    expect(summarizeAdaptiveThinking({})).toBe(false);
  });
});
