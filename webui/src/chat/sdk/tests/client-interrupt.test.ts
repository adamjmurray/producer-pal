// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Focused coverage for the message-queuing interrupt path in processStream:
 * shouldInterrupt is checked ONLY at start-step boundaries (between tool steps),
 * so a queued follow-up cuts a multi-step tool loop short without discarding
 * already-streamed content or leaving a dangling tool-call.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";

// Mock streamText from ai
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    streamText: vi.fn(),
    generateText: vi.fn(),
  };
});

// Mock MCP tools
vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

// Mock getMcpUrl
vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { streamText } from "ai";
import { ChatSdkClient } from "#webui/chat/sdk/client";

/**
 * Create a mock config.
 * @param overrides - Config overrides
 * @returns Mock ChatClientConfig
 */
function createConfig(overrides?: Partial<ChatClientConfig>): ChatClientConfig {
  return {
    model: {
      modelId: "test",
      provider: "openai",
      specificationVersion: "v3",
    } as never,
    showThoughts: false,
    ...overrides,
  };
}

/**
 * Stream the given parts through a fresh client, passing a shouldInterrupt
 * callback, and return the final chat-history snapshot.
 * @param parts - Stream parts to emit
 * @param shouldInterrupt - Interrupt callback forwarded to sendMessage
 * @returns Final chat history
 */
async function sendWithInterrupt(
  parts: Record<string, unknown>[],
  shouldInterrupt: () => boolean,
): Promise<ChatMessage[]> {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: iterate(),
  });

  const client = new ChatSdkClient("key", createConfig());
  let last: ChatMessage[] = [];

  for await (const history of client.sendMessage(
    "Hello",
    undefined,
    undefined,
    shouldInterrupt,
  )) {
    last = history;
  }

  return last;
}

describe("ChatSdkClient interrupt (message queuing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps history valid when interrupting after a completed tool step", async () => {
    // A full tool step (call + result) finishes, then the model starts a new
    // step. A queued message interrupts at that boundary. The completed
    // tool-call already has its result, so reconcile must NOT fabricate a
    // "Canceled" result — the history is already valid.
    const last = await sendWithInterrupt(
      [
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-read-song",
          input: {},
        },
        {
          type: "tool-result",
          toolCallId: "tc1",
          toolName: "ppal-read-song",
          input: {},
          output: "OK",
        },
        { type: "finish-step" },
        { type: "start-step", messageId: "m2" },
        { type: "text-delta", text: "Should not appear" },
      ],
      () => true,
    );

    // Only user + the first assistant turn (interrupted before step 2).
    expect(last).toHaveLength(2);

    const assistant = last[1]!;

    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolResults).toHaveLength(1);
    expect(assistant.toolResults![0]!.id).toBe("tc1");
    expect(assistant.toolResults![0]!.result).toBe("OK");
    expect(assistant.toolResults![0]!.isError).toBe(false);
    // The post-interrupt text never made it into history.
    expect(assistant.content).toBe("");
  });

  it("continues through every step when shouldInterrupt stays false", async () => {
    // Guards against an inverted interrupt condition: a false callback must let
    // a multi-step response run to completion.
    const last = await sendWithInterrupt(
      [
        { type: "text-delta", text: "First" },
        { type: "start-step", messageId: "m2" },
        { type: "text-delta", text: "Second" },
      ],
      () => false,
    );

    expect(last).toHaveLength(3);
    expect(last[1]!.content).toBe("First");
    expect(last[2]!.content).toBe("Second");
  });

  it("interrupts only at the step boundary, not mid-text", async () => {
    // shouldInterrupt is true throughout, but the first step's text deltas must
    // all land before the start-step check cuts the stream off.
    const last = await sendWithInterrupt(
      [
        { type: "text-delta", text: "First" },
        { type: "text-delta", text: " and more" },
        { type: "start-step", messageId: "m2" },
        { type: "text-delta", text: "Second" },
      ],
      () => true,
    );

    expect(last).toHaveLength(2);
    expect(last[1]!.content).toBe("First and more");
  });

  it("never checks shouldInterrupt for a single-turn response", async () => {
    // No start-step means no step boundary, so a non-empty queue must NOT
    // interrupt a plain single-turn reply — it streams to completion and the
    // queue drains afterward (handled one level up in useChat).
    const shouldInterrupt = vi.fn(() => true);

    const last = await sendWithInterrupt(
      [
        { type: "text-delta", text: "Complete answer" },
        { type: "finish", finishReason: "stop" },
      ],
      shouldInterrupt,
    );

    expect(shouldInterrupt).not.toHaveBeenCalled();
    expect(last).toHaveLength(2);
    expect(last[1]!.content).toBe("Complete answer");
  });
});
