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
      for await (const _snapshot of args.executeStream());

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
    const client = new MockChatClient();

    client.chatHistory = [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
    ];
    const { result, runWithChat } = setup({
      client,
      messages: [userMessage(2, "never sent")],
    });

    await act(async () => {
      await result.current.handleRetry(0);
    });

    expect(runWithChat).toHaveBeenCalled();
    expect(client.chatHistory).toContainEqual({
      role: "user",
      content: "never sent",
    });
  });

  it("handleRetry bails when the raw entry yields no user message", async () => {
    // The raw history slot resolves to an assistant turn, so extractUserMessage
    // returns undefined and there is nothing to re-send.
    const client = new MockChatClient();

    client.chatHistory = [{ role: "assistant", content: "hi" }];
    const { result, runWithChat } = setup({
      client,
      messages: [userMessage(0)],
    });

    await act(async () => {
      await result.current.handleRetry(0);
    });

    expect(runWithChat).not.toHaveBeenCalled();
  });
});
