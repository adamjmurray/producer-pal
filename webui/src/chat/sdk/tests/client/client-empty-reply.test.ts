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

import { buildModelMessages } from "#webui/chat/sdk/build-model-messages";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  createConfig,
  mockStreamParts,
  sendWithParts,
} from "#webui/chat/sdk/tests/client-test-helpers";

const NOTICE = /ended this reply without any content/;

const LIMIT_NOTICE = /hit the output limit and was cut off/;
const LIMIT_ENTRY = {
  role: "assistant",
  content: expect.stringMatching(LIMIT_NOTICE) as unknown,
  isError: true,
};

const TOOL_STEP_PARTS = [
  { type: "start-step" },
  {
    type: "tool-call",
    toolCallId: "t1",
    toolName: "ppal-read-live-set",
    input: {},
  },
  {
    type: "tool-result",
    toolCallId: "t1",
    toolName: "ppal-read-live-set",
    input: {},
    output: "ok",
  },
];

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

describe("reply cut off by the output limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the partial text and adds the notice after it", async () => {
    const history = await sendWithParts([
      { type: "start-step" },
      { type: "text-delta", text: "Here is the start" },
      { type: "finish-step", finishReason: "length" },
      { type: "finish", finishReason: "length" },
    ]);

    expect(history).toHaveLength(3);
    expect(history[1]?.content).toBe("Here is the start");
    expect(history[1]?.isError).toBeUndefined();
    expect(history[2]).toStrictEqual(LIMIT_ENTRY);
    expect(history[2]?.content).toContain("Retry");
    expect(history[2]?.content).toContain("continue");
  });

  it("adds the notice when the cut-off reply has no text", async () => {
    const history = await sendWithParts([
      { type: "start-step" },
      { type: "finish-step", finishReason: "length" },
      { type: "finish", finishReason: "length" },
    ]);

    expect(history).toHaveLength(2);
    expect(history[1]).toStrictEqual(LIMIT_ENTRY);
  });

  it("adds exactly one notice when the step after a tool step is cut off", async () => {
    const history = await sendWithParts([
      ...TOOL_STEP_PARTS,
      { type: "finish-step", finishReason: "tool-calls" },
      { type: "start-step" },
      { type: "text-delta", text: "Partial" },
      { type: "finish-step", finishReason: "length" },
      { type: "finish", finishReason: "length" },
    ]);

    expect(history.filter((m) => m.isError)).toStrictEqual([LIMIT_ENTRY]);
    expect(history.at(-1)).toStrictEqual(LIMIT_ENTRY);
  });

  it("adds nothing when only an earlier step was cut off", async () => {
    const history = await sendWithParts([
      ...TOOL_STEP_PARTS,
      { type: "finish-step", finishReason: "length" },
      { type: "start-step" },
      { type: "text-delta", text: "All done." },
      { type: "finish-step", finishReason: "stop" },
      { type: "finish", finishReason: "stop" },
    ]);

    expect(history.some((m) => m.isError)).toBe(false);
    expect(history.at(-1)?.content).toBe("All done.");
  });

  it("skips the notice but keeps the partial text in the next request", async () => {
    mockStreamParts([
      { type: "start-step" },
      { type: "text-delta", text: "Here is the start" },
      { type: "finish-step", finishReason: "length" },
      { type: "finish", finishReason: "length" },
    ]);

    const client = new ChatSdkClient("key", createConfig());

    for await (const _ of client.sendMessage("first")) {
      /* consume */
    }

    client.chatHistory.push({ role: "user", content: "continue" });

    const messages = buildModelMessages(client.chatHistory);

    expect(messages.map((m) => m.role)).toStrictEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(JSON.stringify(messages)).not.toMatch(LIMIT_NOTICE);
  });
});
