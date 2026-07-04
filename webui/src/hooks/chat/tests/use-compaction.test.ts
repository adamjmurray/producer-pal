// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useCompaction } from "#webui/hooks/chat/use-compaction";
import {
  createMockAdapter,
  MockChatClient,
  type TestMessage,
} from "#webui/hooks/chat/tests/use-chat-test-helpers";
import { type UIMessage } from "#webui/types/messages";

function ui(role: "user" | "model", rawHistoryIndex: number): UIMessage {
  return {
    role,
    parts: [{ type: "text", content: "x" }],
    rawHistoryIndex,
    timestamp: 0,
  };
}

interface SetupOptions {
  chatHistory?: TestMessage[];
  messages?: UIMessage[];
  isAssistantResponding?: boolean;
  noClient?: boolean;
  bootstrapClientRef?: { current: (() => Promise<void>) | null };
}

function setup(opts: SetupOptions = {}) {
  const client = new MockChatClient();

  client.chatHistory = opts.chatHistory ?? [
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1" },
  ];

  const clientRef = { current: opts.noClient ? null : client };
  const adapter = createMockAdapter();
  const setMessages = vi.fn();
  const autoSave = vi.fn();
  const messages = opts.messages ?? [ui("user", 0), ui("model", 1)];

  const { result } = renderHook(() =>
    useCompaction({
      clientRef,
      bootstrapClientRef: opts.bootstrapClientRef,
      adapter,
      autoSaveRef: { current: autoSave },
      messages,
      isAssistantResponding: opts.isAssistantResponding ?? false,
      setMessages,
    }),
  );

  return { result, client, clientRef, adapter, setMessages, autoSave };
}

describe("useCompaction", () => {
  it("compacts the whole conversation when the last message is targeted", async () => {
    const { result, client, setMessages, autoSave } = setup();

    await act(async () => {
      await result.current.compact(1);
    });

    expect(client.summarize).toHaveBeenCalledWith([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
    // Non-destructive: prior turns are kept and the summary marker is appended.
    expect(client.chatHistory).toStrictEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
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
      chatHistory: [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
      ],
      messages: [ui("user", 0), ui("model", 1), ui("user", 2), ui("model", 3)],
    });

    await act(async () => {
      await result.current.compact(1);
    });

    expect(client.summarize).toHaveBeenCalledWith([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ]);
    expect(client.chatHistory).toStrictEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "Summary of 4 messages" },
    ]);
  });

  it("does nothing while the assistant is responding", async () => {
    const { result, client, setMessages } = setup({
      isAssistantResponding: true,
    });

    await act(async () => {
      await result.current.compact(1);
    });

    expect(client.summarize).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
  });

  it("does nothing when there is no active client", async () => {
    const { result, setMessages } = setup({ noClient: true });

    await act(async () => {
      await result.current.compact(0);
    });

    expect(setMessages).not.toHaveBeenCalled();
    expect(result.current.canUndoCompaction).toBe(false);
  });

  it("surfaces an error message when summarization fails", async () => {
    const { result, client, adapter, setMessages } = setup();

    client.summarize.mockRejectedValueOnce(new Error("boom"));

    await act(async () => {
      await result.current.compact(1);
    });

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

    await act(async () => {
      await result.current.compact(1);
    });
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

    await act(async () => {
      await result.current.compact(0);
    });

    expect(client.summarize).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
  });

  it("does nothing when the client history is empty", async () => {
    const { result, client, setMessages } = setup({ chatHistory: [] });

    await act(async () => {
      await result.current.compact(1);
    });

    expect(client.summarize).not.toHaveBeenCalled();
    expect(setMessages).not.toHaveBeenCalled();
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

    await act(async () => {
      await result.current.compact(1);
    });

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

  it("invalidateCompactionUndo clears the undo availability", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.compact(1);
    });
    expect(result.current.canUndoCompaction).toBe(true);

    await act(async () => {
      result.current.invalidateCompactionUndo();
    });
    expect(result.current.canUndoCompaction).toBe(false);
  });
});
