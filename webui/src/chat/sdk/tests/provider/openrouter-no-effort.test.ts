// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";

// Every real thinking level maps to an effort; force the "no effort" answer.
vi.mock(
  import("#webui/hooks/settings/config-builders"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return { ...actual, mapThinkingToOpenRouterEffort: vi.fn(() => undefined) };
  },
);

import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";

describe("buildProviderOptions for OpenRouter without an effort", () => {
  it("sends no provider options", () => {
    expect(
      buildProviderOptions(
        "openrouter",
        "Auto",
        "deepseek/deepseek-v4.1-flash",
      ),
    ).toBeUndefined();
  });
});
