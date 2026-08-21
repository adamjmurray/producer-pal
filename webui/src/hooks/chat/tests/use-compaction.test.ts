// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, type Mock, vi } from "vitest";
import { useCompaction } from "#webui/hooks/chat/use-compaction";
import {
  createMockAdapter,
  MockChatClient,
  type TestMessage,
} from "#webui/hooks/chat/tests/helpers/use-chat-test-helpers";
import { type UIMessage } from "#webui/types/messages";

function ui(role: "user" | "model", rawHistoryIndex: number): UIMessage {
  return {
    role,
    parts: [{ type: "text", content: "x" }],
    rawHistoryIndex,
    timestamp: 0,
  };
}

/**
 * Builds `turnCount` user/assistant exchanges of client history, numbered from
 * 1 (u1/a1, u2/a2, …). Used both to seed MockChatClient.chatHistory and to
 * assert what was handed to summarize(), so the two always line up.
 * @param turnCount - Number of user/assistant exchanges to build
 * @returns The flat history, two messages per turn
 */
function turns(turnCount: number): TestMessage[] {
  const history: TestMessage[] = [];

  for (let turn = 1; turn <= turnCount; turn++) {
    history.push({ role: "user", content: `u${turn}` });
    history.push({ role: "assistant", content: `a${turn}` });
  }

  return history;
}

/**
 * The UI-message view of `turns(turnCount)`: one user/model pair per turn, with
 * rawHistoryIndex tracking the flat history positions.
 * @param turnCount - Number of user/assistant exchanges to build
 * @returns The UI messages, two per turn
 */
function uiTurns(turnCount: number): UIMessage[] {
  return turns(turnCount).map((message, index) =>
    ui(message.role === "user" ? "user" : "model", index),
  );
}

interface SetupOptions {
  chatHistory?: TestMessage[];
  messages?: UIMessage[];
  isAssistantResponding?: boolean;
  noClient?: boolean;
  bootstrapClientRef?: { current: (() => Promise<void>) | null };
  pendingHistory?: TestMessage[];
}

function setup(opts: SetupOptions = {}) {
  const client = new MockChatClient();

  client.chatHistory = opts.chatHistory ?? turns(1);

  const clientRef = { current: opts.noClient ? null : client };
  const adapter = createMockAdapter();
  const setMessages = vi.fn();
  const autoSave = vi.fn();
  const messages = opts.messages ?? uiTurns(1);
  const pendingHistoryRef = { current: opts.pendingHistory ?? null };

  const { result } = renderHook(() =>
    useCompaction({
      clientRef,
      bootstrapClientRef: opts.bootstrapClientRef,
      pendingHistoryRef,
      adapter,
      autoSaveRef: { current: autoSave },
      messages,
      isAssistantResponding: opts.isAssistantResponding ?? false,
      setMessages,
    }),
  );

  return {
    result,
    client,
    clientRef,
    adapter,
    setMessages,
    autoSave,
    pendingHistoryRef,
  };
}

type CompactionHook = ReturnType<typeof setup>["result"];

/**
 * Runs the hook's compact() for a targeted message index inside act(), so the
 * resulting state updates are flushed before the test asserts.
 * @param result - The rendered useCompaction result from setup()
 * @param mergedMessageIndex - Index of the UI message the compact button targets
 */
async function compactAt(
  result: CompactionHook,
  mergedMessageIndex: number,
): Promise<void> {
  await act(async () => {
    await result.current.compact(mergedMessageIndex);
  });
}

/**
 * Asserts compact() bailed out entirely: it never summarized and never touched
 * the UI messages.
 * @param client - The mock chat client from setup()
 * @param setMessages - The setMessages spy from setup()
 */
function expectNoCompaction(client: MockChatClient, setMessages: Mock): void {
  expect(client.summarize).not.toHaveBeenCalled();
  expect(setMessages).not.toHaveBeenCalled();
}

describe("useCompaction", () => {
  it("compacts the whole conversation when the last message is targeted", async () => {
    const { result, client, setMessages, autoSave } = setup();

    await compactAt(result, 1);

    expect(client.summarize).toHaveBeenCalledWith(turns(1));
    // Non-destructive: prior turns are kept and the summary marker is appended.
    expect(client.chatHistory).toStrictEqual([
      ...turns(1),
      { role: "user", content: "Summary of 2 messages" },
    ]);
    expect(setMessages).toHaveBeenCalled();
    expect(autoSave).toHaveBeenCalled();
    expect(result.current.canUndoCompaction).toBe(true);
  });

  it("compacts the full history regardless of the targeted index", async () => {
    // The compact button is gated to the last assistant message, so there is no
    // tail to drop — compaction always summarizes the entire visible history.
    const { result, client } = setup({
      chatHistory: turns(2),
      messages: uiTurns(2),
    });

    await compactAt(result, 1);

    expect(client.summarize).toHaveBeenCalledWith(turns(2));
    expect(client.chatHistory).toStrictEqual([
      ...turns(2),
      { role: "user", content: "Summary of 4 messages" },
    ]);
  });

  it("does nothing while the assistant is responding", async () => {
    const { result, client, setMessages } = setup({
      isAssistantResponding: true,
    });

    await compactAt(result, 1);

    expectNoCompaction(client, setMessages);
  });

  it("does nothing when there is no active client", async () => {
    const { result, setMessages } = setup({ noClient: true });

    await compactAt(result, 0);

    expect(setMessages).not.toHaveBeenCalled();
    expect(result.current.canUndoCompaction).toBe(false);
  });

  it("surfaces an error message when summarization fails", async () => {
    const { result, client, adapter, setMessages } = setup();

    client.summarize.mockRejectedValueOnce(new Error("boom"));

    await compactAt(result, 1);

    expect(adapter.createErrorMessage).toHaveBeenCalled();
    expect(setMessages).toHaveBeenCalled();
    expect(result.current.isCompacting).toBe(false);
  });

  it("ignores a resolved summary after the conversation was switched away", async () => {
    // Switching conversations mid-summary nulls clientRef (both clearConversation
    // and restoreChatHistory do). The resolved summary must not overwrite the
    // newly-loaded conversation's view or arm an undo pointing at old history.
    const { result, client, clientRef, setMessages, autoSave } = setup();
    const original = [...client.chatHistory];

    let resolveSummary: (value: string) => void = () => {};

    client.summarize.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveSummary = resolve;
      }),
    );

    await act(async () => {
      const pending = result.current.compact(1);

      // The user switches conversations while the summary is in flight.
      clientRef.current = null;
      resolveSummary("Summary");
      await pending;
    });

    // The stale (old) client is untouched and nothing leaked into the UI.
    expect(client.chatHistory).toStrictEqual(original);
    expect(setMessages).not.toHaveBeenCalled();
    expect(autoSave).not.toHaveBeenCalled();
    expect(result.current.canUndoCompaction).toBe(false);
  });

  it("restores the pre-compaction history on undo", async () => {
    const { result, client } = setup();
    const original = [...client.chatHistory];

    await compactAt(result, 1);
    await act(async () => {
      result.current.undoCompaction();
    });

    expect(client.chatHistory).toStrictEqual(original);
    expect(result.current.canUndoCompaction).toBe(false);
  });

  it("undo is a no-op when there is no snapshot", async () => {
    const { result, client, setMessages } = setup();
    const before = client.chatHistory;

    await act(async () => {
      result.current.undoCompaction();
    });

    expect(client.chatHistory).toBe(before);
    expect(setMessages).not.toHaveBeenCalled();
  });

  it("does nothing when the targeted message index has no message", async () => {
    const { result, client, setMessages } = setup({ messages: [] });

    await compactAt(result, 0);

    expectNoCompaction(client, setMessages);
  });

  it("does nothing when the client history is empty", async () => {
    const { result, client, setMessages } = setup({ chatHistory: [] });

    await compactAt(result, 1);

    expectNoCompaction(client, setMessages);
  });

  it("ignores a rejected summary after the conversation was switched away", async () => {
    // Like the resolved-after-switch case, but the summary REJECTS post-switch:
    // the catch must detect the stale client and bail without rendering an error.
    const { result, client, clientRef, setMessages } = setup();

    let rejectSummary: (err: unknown) => void = () => {};

    client.summarize.mockReturnValueOnce(
      new Promise<string>((_, reject) => {
        rejectSummary = reject;
      }),
    );

    await act(async () => {
      const pending = result.current.compact(1);

      clientRef.current = null;
      rejectSummary(new Error("boom"));
      await pending;
    });

    expect(setMessages).not.toHaveBeenCalled();
  });

  it("falls back to empty history in the error message when bootstrap fails before a client exists", async () => {
    // A restored-but-not-sent conversation has no client; the bootstrap rejects
    // before one is captured, so the catch renders the error with empty history.
    const bootstrap = vi.fn().mockRejectedValue(new Error("bootstrap boom"));
    const { result, adapter, setMessages } = setup({
      noClient: true,
      bootstrapClientRef: { current: bootstrap },
    });

    await compactAt(result, 1);

    expect(bootstrap).toHaveBeenCalled();
    // The mock createErrorMessage mutates the array it receives, so assert the
    // shape rather than an exact empty array. What matters for coverage is that
    // the `?? []` fallback supplied a history when clientRef.current was null.
    expect(adapter.createErrorMessage).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Array),
    );
    expect(setMessages).toHaveBeenCalled();
  });

  it("renders the pending history behind a failed bootstrap's error", async () => {
    // Same failure, but the conversation is restored-but-not-sent: it lives in
    // pendingHistory, so the error belongs behind it. Rendering from an empty
    // history collapsed the whole transcript to a lone error bubble.
    const bootstrap = vi.fn().mockRejectedValue(new Error("bootstrap boom"));
    const { result, setMessages, pendingHistoryRef } = setup({
      noClient: true,
      bootstrapClientRef: { current: bootstrap },
      pendingHistory: turns(2),
    });

    await compactAt(result, 1);

    const rendered = setMessages.mock.calls[0]?.[0] as UIMessage[];

    expect(rendered).toHaveLength(5);
    expect(rendered.at(-1)?.parts[0]?.type).toBe("error");
    // The ref's own array is untouched, so the next send bootstraps from the
    // conversation rather than from the conversation plus a stray error turn.
    expect(pendingHistoryRef.current).toStrictEqual(turns(2));
  });

  it("invalidateCompactionUndo clears the undo availability", async () => {
    const { result } = setup();

    await compactAt(result, 1);
    expect(result.current.canUndoCompaction).toBe(true);

    await act(async () => {
      result.current.invalidateCompactionUndo();
    });
    expect(result.current.canUndoCompaction).toBe(false);
  });
});
