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
    expect(client.chatHistory).toStrictEqual([
      { role: "user", content: "Summary of 2 messages" },
    ]);
    expect(setMessages).toHaveBeenCalled();
    expect(autoSave).toHaveBeenCalled();
    expect(result.current.canUndoCompaction).toBe(true);
  });

  it("drops the tail when an earlier message is targeted", async () => {
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
    ]);
    expect(client.chatHistory).toHaveLength(1);
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
