// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * A queued message interrupts a tool loop between steps. This runs the real
 * streamText (not a mock of it), because the thing under test is whether the
 * AI SDK's own loop stops: leaving our read loop does not stop it.
 */
import { jsonSchema, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = { toolRuns: 0, modelCalls: 0 };

vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockImplementation(async () => ({
    tools: {
      edit: tool({
        description: "edit",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => {
          counts.toolRuns++;

          return "ok";
        },
      }),
    },
    mcpClient: { close: async () => {} },
  })),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { ChatSdkClient } from "#webui/chat/sdk/client";
import { type ChatMessage } from "#webui/chat/sdk/types";

const STEP_DELAY_MS = 5;

/**
 * One model response that calls the `edit` tool, streamed with small delays.
 * @param id - Tool call id
 * @returns A provider stream
 */
function toolCallStream(id: string): ReadableStream {
  const parts = [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: id, toolName: "edit", input: "{}" },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: "tool_use" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
    },
  ];

  return new ReadableStream({
    async start(controller) {
      for (const part of parts) {
        await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS));
        controller.enqueue(part);
      }

      controller.close();
    },
  });
}

/**
 * Run one turn against a model that calls the tool on every step.
 * @param shouldInterrupt - Interrupt callback forwarded to sendMessage
 * @param abortSignal - The caller's own Stop signal
 * @returns The client and the last history it yielded
 */
async function runTurn(
  shouldInterrupt: () => boolean,
  abortSignal?: AbortSignal,
): Promise<{ client: ChatSdkClient; last: ChatMessage[] }> {
  const model = new MockLanguageModelV4({
    doStream: async () => {
      counts.modelCalls++;

      return { stream: toolCallStream(`call-${counts.modelCalls}`) };
    },
  });
  const client = new ChatSdkClient("key", {
    model: model as never,
    maxSteps: 5,
  });

  await client.initialize();

  let last: ChatMessage[] = [];

  for await (const history of client.sendMessage(
    "hi",
    abortSignal,
    undefined,
    shouldInterrupt,
  )) {
    last = history;
  }

  // Long enough for a step that was still running to call its tool.
  await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS * 30));

  return { client, last };
}

describe("ChatSdkClient interrupt on a live stream", () => {
  beforeEach(() => {
    counts.toolRuns = 0;
    counts.modelCalls = 0;
  });

  it("runs no further tool once a queued message interrupts", async () => {
    const { client, last } = await runTurn(() => counts.toolRuns >= 1);

    expect(counts.toolRuns).toBe(1);
    expect(client.chatHistory).toStrictEqual(last);
    expect(JSON.stringify(last)).toContain("call-1");
    expect(JSON.stringify(last)).not.toContain("call-2");
  });

  it("does not abort the caller's own signal", async () => {
    const controller = new AbortController();

    await runTurn(() => counts.toolRuns >= 1, controller.signal);

    expect(controller.signal.aborted).toBe(false);
    expect(counts.toolRuns).toBe(1);
  });

  it("runs every step when nothing interrupts", async () => {
    await runTurn(() => false);

    expect(counts.toolRuns).toBe(5);
    expect(counts.modelCalls).toBe(5);
  });

  it("still stops on the caller's signal", async () => {
    const controller = new AbortController();

    await runTurn(() => {
      if (counts.toolRuns >= 2) {
        controller.abort();
      }

      return false;
    }, controller.signal);

    expect(counts.toolRuns).toBe(2);
  });

  it("runs nothing when the caller's signal was already aborted", async () => {
    const controller = new AbortController();

    controller.abort();
    await runTurn(() => false, controller.signal);

    expect(counts.toolRuns).toBe(0);
  });
});
