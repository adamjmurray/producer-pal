// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, streamText: vi.fn(), generateText: vi.fn() };
});

vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { sendWithParts } from "#webui/chat/sdk/tests/client-test-helpers";

const NOTICE = /ended this reply without any content/;

describe("empty reply from the provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["other", "error"])(
    "shows an error when the reply ends on %s with no content",
    async (finishReason) => {
      const history = await sendWithParts([
        { type: "start-step" },
        { type: "finish-step", finishReason },
        { type: "finish", finishReason },
      ]);

      expect(history).toHaveLength(2);
      expect(history[1]?.isError).toBe(true);
      expect(history[1]?.content).toMatch(NOTICE);
    },
  );

  it("adds nothing when the reply ends on other but has text", async () => {
    const history = await sendWithParts([
      { type: "start-step" },
      { type: "text-delta", text: "Here is the answer" },
      { type: "finish-step", finishReason: "other" },
      { type: "finish", finishReason: "other" },
    ]);

    expect(history).toHaveLength(2);
    expect(history[1]?.content).toBe("Here is the answer");
    expect(history.some((m) => m.isError)).toBe(false);
  });

  it("keeps the content filter wording for a filtered reply", async () => {
    const history = await sendWithParts([
      { type: "finish", finishReason: "content-filter" },
    ]);

    expect(history[1]?.content).toMatch(/content filter/);
  });
});
