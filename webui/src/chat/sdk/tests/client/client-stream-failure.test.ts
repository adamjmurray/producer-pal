// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
import {
  CANCELED_TOOL_RESULT_TEXT,
  FAILED_TOOL_RESULT_TEXT,
} from "#webui/chat/sdk/build-model-messages";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  abortError,
  createConfig,
  failingAfterStream,
  mockStreamParts,
} from "#webui/chat/sdk/tests/client-test-helpers";
import { type ChatMessage } from "#webui/chat/sdk/types";

/** The tool-call part a turn emits just before the stream dies under it. */
const TOOL_CALL_PART = {
  type: "tool-call",
  toolCallId: "tc1",
  toolName: "ppal-create-clip",
  input: {},
};

/**
 * A stream that emits the tool-call and then aborts the turn — the shape a Stop
 * mid-tool produces, where the signal is what says the user did it.
 * @param controller - Aborted as the stream fails, as a real Stop would
 * @returns A streamText-shaped result
 */
function stoppedMidTool(controller: AbortController): {
  stream: AsyncIterable<Record<string, unknown>>;
} {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    yield TOOL_CALL_PART;
    controller.abort();

    throw abortError();
  }

  return { stream: iterate() };
}

/**
 * Drive one turn whose stream dies mid-tool and return the resulting history.
 * @param stream - The failing stream to serve
 * @param abortSignal - Signal the turn runs under, when there is one
 * @returns The client, so callers can read its history or resume it
 */
async function turnDyingMidTool(
  stream: { stream: AsyncIterable<Record<string, unknown>> },
  abortSignal?: AbortSignal,
): Promise<ChatSdkClient> {
  (streamText as ReturnType<typeof vi.fn>).mockReturnValue(stream);

  const client = new ChatSdkClient("key", createConfig());

  await expect(async () => {
    for await (const _ of client.sendMessage("add a bass", abortSignal)) {
      /* consume */
    }
  }).rejects.toThrow();

  return client;
}

/**
 * The synthetic result the reconcile left on the turn's dangling tool-call.
 * @param client - The client whose turn died mid-tool
 * @returns The backfilled result text
 */
function backfilledResult(client: ChatSdkClient): unknown {
  const assistant = client.chatHistory.find(
    (m: ChatMessage) => m.role === "assistant",
  );

  expect(assistant?.toolResults).toHaveLength(1);

  return assistant?.toolResults?.[0]?.result;
}

describe("a stream that dies between a tool-call and its result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says the request failed when nobody canceled it", async () => {
    // A 429 (or any mid-stream error) after the tool-call part. The turn is
    // retried by resuming this history, so claiming the user canceled would put
    // a statement in it that never happened.
    const client = await turnDyingMidTool(
      failingAfterStream([TOOL_CALL_PART], new Error("429 rate limit")),
    );

    expect(backfilledResult(client)).toBe(FAILED_TOOL_RESULT_TEXT);
  });

  it("still says canceled when the user pressed Stop", async () => {
    const controller = new AbortController();
    const client = await turnDyingMidTool(
      stoppedMidTool(controller),
      controller.signal,
    );

    expect(backfilledResult(client)).toBe(CANCELED_TOOL_RESULT_TEXT);
  });

  it("hands the retry the failure text, not a cancellation", async () => {
    // The end of the bug: the resumed request ends on tool results, so the model
    // is handed this text as the answer to the tool it never saw finish.
    const client = await turnDyingMidTool(
      failingAfterStream([TOOL_CALL_PART], new Error("429 rate limit")),
    );

    mockStreamParts([{ type: "finish", finishReason: "stop" }]);

    for await (const _ of client.resumeStream()) {
      /* consume */
    }

    const lastCall = (streamText as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as
      | { messages: { role: string; content: { output: unknown }[] }[] }
      | undefined;
    const toolMsg = lastCall?.messages.at(-1);

    expect(toolMsg?.role).toBe("tool");
    expect(toolMsg?.content[0]?.output).toStrictEqual({
      type: "text",
      value: FAILED_TOOL_RESULT_TEXT,
    });
  });
});
