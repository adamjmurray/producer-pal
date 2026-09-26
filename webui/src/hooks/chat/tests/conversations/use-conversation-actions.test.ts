// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useConversationActions } from "#webui/hooks/chat/use-conversation-actions";
import {
  createMockAdapter,
  MockChatClient,
  type TestMessage,
} from "#webui/hooks/chat/tests/helpers/use-chat-test-helpers";
import { type UIMessage } from "#webui/types/messages";

/**
 * Build a minimal user UIMessage pointing at the given raw history index.
 * @param rawHistoryIndex - Index into the raw chat history
 * @param text - On-screen text of the message
 * @returns A user-role UIMessage
 */
function userMessage(rawHistoryIndex: number, text = "x"): UIMessage {
  return {
    role: "user",
    parts: [{ type: "text", content: text }],
    rawHistoryIndex,
    timestamp: 0,
  };
}

interface DepsOverrides {
  messages?: UIMessage[];
  client?: MockChatClient | null;
  pendingHistory?: TestMessage[] | null;
}

/**
 * Render useConversationActions with lean stub deps and expose the spies that
 * prove whether the guard early-returns fired (runWithChat / invalidate never
 * run past a bail).
 * @param over - Per-test overrides
 * @returns The hook result plus the key spies
 */
function setup(over: DepsOverrides = {}) {
  const adapter = createMockAdapter();
  const runWithChat = vi.fn(
    async (fn: (stillCurrent: () => boolean) => Promise<unknown>) =>
      await fn(() => true),
  );
  const invalidateCompactionUndo = vi.fn();
  // Drain the stream so the mock client records what was actually re-sent.
  const executeWithRetry = vi.fn(
    async (args: { executeStream: () => AsyncIterable<TestMessage[]> }) => {
      for await (const _snapshot of args.executeStream()) {
        // drain
      }

      return true;
    },
  );
  const clientRef = { current: over.client ?? null };
  const pendingHistoryRef = { current: over.pendingHistory ?? null };

  const { result } = renderHook(() =>
    useConversationActions({
      apiKey: "test-key",
      messages: over.messages ?? [userMessage(0)],
      adapter,
      clientRef,
      pendingHistoryRef,
      abortControllerRef: { current: null },
      initializeChat: vi.fn(async () => {}),
      runWithChat: runWithChat as never,
      executeWithRetry: executeWithRetry as never,
      invalidateCompactionUndo,
      drainQueuedFollowUps: vi.fn(async () => {}),
      applyPendingLock: vi.fn(),
    }),
  );

  return { result, runWithChat, invalidateCompactionUndo, adapter };
}

type ConversationActions = ReturnType<typeof useConversationActions>;

/**
 * Render the hook over a mock client whose raw history is already populated.
 * @param chatHistory - Raw history the client starts with
 * @param messages - On-screen messages the hook sees
 * @returns The mock client plus the hook result and spies
 */
function setupWithHistory(chatHistory: TestMessage[], messages: UIMessage[]) {
  const client = new MockChatClient();

  client.chatHistory = chatHistory;

  return { client, ...setup({ client, messages }) };
}

describe("useConversationActions guards", () => {
  it("handleEdit bails before forking when there is no history to slice", async () => {
    // Both a live client and pending restore history are absent, so
    // forkConversation has nothing to truncate and returns before invalidating.
    const { result, runWithChat, invalidateCompactionUndo } = setup({
      client: null,
      pendingHistory: null,
    });

    await act(async () => {
      await result.current.handleEdit(0, "edited");
    });

    expect(invalidateCompactionUndo).not.toHaveBeenCalled();
    expect(runWithChat).not.toHaveBeenCalled();
  });

  it("handleRetry bails when there is no history", async () => {
    const { result, runWithChat } = setup({
      client: null,
      pendingHistory: null,
    });

    await act(async () => {
      await result.current.handleRetry(0);
    });

    expect(runWithChat).not.toHaveBeenCalled();
  });

  it("handleRetry re-sends the on-screen text when the raw entry is missing", async () => {
    // A send that failed before the client saw it (no API key) leaves a row
    // whose raw index points past the end of the client's history. Retry must
    // still fork from the text on screen instead of silently doing nothing.
    const { client, result, runWithChat } = setupWithHistory(
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
      ],
      [userMessage(2, "never sent")],
    );

    await act(async () => {
      await result.current.handleRetry(0);
    });

    expect(runWithChat).toHaveBeenCalled();
    expect(client.chatHistory).toContainEqual({
      role: "user",
      content: "never sent",
    });
  });

  it.each([
    {
      what: "handleRetry re-sends the original message's images",
      images: [{ mediaType: "image/png", data: "AAA" }],
      sent: "match this",
      message: userMessage(0),
      run: async (actions: ConversationActions) => await actions.handleRetry(0),
      content: "match this",
    },
    {
      what: "handleEdit keeps the original message's images",
      images: [{ mediaType: "image/webp", data: "BBB" }],
      sent: "match this",
      message: userMessage(0),
      run: async (actions: ConversationActions) =>
        await actions.handleEdit(0, "match this, but slower"),
      content: "match this, but slower",
    },
    {
      what: "handleRetry re-sends an image-only message that has no text",
      images: [{ mediaType: "image/png", data: "AAA" }],
      sent: "",
      message: userMessage(0, ""),
      run: async (actions: ConversationActions) => await actions.handleRetry(0),
      content: "",
    },
  ])("$what", async ({ images, sent, message, run, content }) => {
    const { client, result, runWithChat } = setupWithHistory(
      [
        { role: "user", content: sent, images },
        { role: "assistant", content: "reply" },
      ],
      [message],
    );

    await act(async () => {
      await run(result.current);
    });

    expect(runWithChat).toHaveBeenCalled();
    // The fork truncates to index 0, so the re-sent turn is the only one left.
    expect(client.chatHistory).toContainEqual({
      role: "user",
      content,
      images,
    });
  });

  it.each([
    {
      what: "leaves out the removed images",
      removed: [0],
      expected: {
        role: "user",
        content: "just text",
        images: [{ mediaType: "image/png", data: "BBB" }],
      },
    },
    {
      what: "sends plain text once every image is removed",
      removed: [0, 1],
      expected: { role: "user", content: "just text" },
    },
  ])("handleEdit $what", async ({ removed, expected }) => {
    const images = [
      { mediaType: "image/png", data: "AAA" },
      { mediaType: "image/png", data: "BBB" },
    ];
    const { client, result } = setupWithHistory(
      [
        { role: "user", content: "match this", images },
        { role: "assistant", content: "reply" },
      ],
      [userMessage(0)],
    );

    await act(async () => {
      await result.current.handleEdit(0, "just text", removed);
    });

    expect(client.chatHistory).toContainEqual(expected);
  });

  it("handleRetry bails when the raw entry yields no user message", async () => {
    // The raw history slot resolves to an assistant turn, so extractUserMessage
    // returns undefined and there is nothing to re-send.
    const { result, runWithChat } = setupWithHistory(
      [{ role: "assistant", content: "hi" }],
      [userMessage(0)],
    );

    await act(async () => {
      await result.current.handleRetry(0);
    });

    expect(runWithChat).not.toHaveBeenCalled();
  });
});
