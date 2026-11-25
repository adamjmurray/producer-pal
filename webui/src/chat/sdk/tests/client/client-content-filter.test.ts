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

import { streamText } from "ai";
import { buildModelMessages } from "#webui/chat/sdk/build-model-messages";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  createConfig,
  failingAfterStream,
  itAddsFinishNotice,
  mockStreamParts,
  sendWithParts,
  TOOL_STEP_PARTS,
} from "#webui/chat/sdk/tests/client-test-helpers";

const NOTICE = /content filter/;
const ERROR_ENTRY = {
  role: "assistant",
  content: expect.stringMatching(NOTICE) as unknown,
  isError: true,
};

describe("content-filter finish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itAddsFinishNotice("content-filter", ERROR_ENTRY);

  it("shows an error when Gemini stops a reply for safety with no content", async () => {
    const history = await sendWithParts([
      { type: "start-step" },
      { type: "finish-step", finishReason: "content-filter" },
      { type: "finish", finishReason: "content-filter" },
    ]);

    expect(history).toHaveLength(2);
    expect(history[1]).toStrictEqual(ERROR_ENTRY);
    expect(history[1]?.content).toMatch(NOTICE);
  });

  it("shows an error when OpenAI filters a reply with no content", async () => {
    const history = await sendWithParts([
      { type: "start-step" },
      { type: "reasoning-start", id: "r" },
      { type: "reasoning-end", id: "r" },
      { type: "finish-step", finishReason: "content-filter" },
      { type: "finish", finishReason: "content-filter" },
    ]);

    // The empty reasoning block is not stored as a turn of its own.
    expect(history.map((m) => m.role)).toStrictEqual(["user", "assistant"]);
    expect(history[1]).toStrictEqual(ERROR_ENTRY);
  });

  it("adds nothing for a tool-call step that has no text", async () => {
    const history = await sendWithParts([
      ...TOOL_STEP_PARTS,
      { type: "finish-step", finishReason: "tool-calls" },
      { type: "finish", finishReason: "tool-calls" },
    ]);

    expect(history.some((m) => m.isError)).toBe(false);
    expect(history).toHaveLength(2);
  });

  it("adds nothing for a normal stop", async () => {
    const history = await sendWithParts([
      { type: "text-delta", text: "Hi" },
      { type: "finish", finishReason: "stop" },
    ]);

    expect(history).toHaveLength(2);
    expect(history.some((m) => m.isError)).toBe(false);
  });

  it("keeps the next request valid after an empty filtered reply", async () => {
    mockStreamParts([{ type: "finish", finishReason: "content-filter" }]);

    const client = new ChatSdkClient("key", createConfig());

    for await (const _ of client.sendMessage("first")) {
      /* consume */
    }

    client.chatHistory.push({ role: "user", content: "second" });

    // The error entry is not sent: no empty assistant turn, no broken ordering.
    const messages = buildModelMessages(client.chatHistory);

    expect(messages.map((m) => m.role)).toStrictEqual(["user"]);
  });

  it("adds exactly one notice when a resume after a 429 ends filtered", async () => {
    (streamText as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      failingAfterStream([], new Error("429 rate limit")),
    );

    const client = new ChatSdkClient("key", createConfig());

    await expect(async () => {
      for await (const _ of client.sendMessage("first")) {
        /* consume */
      }
    }).rejects.toThrow("429 rate limit");

    expect(client.chatHistory.some((m) => m.isError)).toBe(false);

    mockStreamParts([{ type: "finish", finishReason: "content-filter" }]);

    for await (const _ of client.resumeStream()) {
      /* consume */
    }

    expect(client.chatHistory.filter((m) => m.isError)).toStrictEqual([
      ERROR_ENTRY,
    ]);
    expect(client.chatHistory.filter((m) => m.role === "user")).toHaveLength(1);
  });
});
