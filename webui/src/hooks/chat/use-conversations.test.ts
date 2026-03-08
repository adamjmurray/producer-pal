// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConversationDb,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { useConversations } from "./use-conversations";

/**
 * Creates default props for useConversations tests.
 * @returns Props with vi.fn() mocks and an updatable chatHistory
 */
function createProps() {
  const state = { chatHistory: [] as unknown[] };

  return {
    state,
    props: {
      getChatHistory: vi.fn(() => state.chatHistory),
      loadConversation: vi.fn(),
      clearConversation: vi.fn(),
    },
  };
}

describe("useConversations", () => {
  beforeEach(async () => {
    resetDbCache();
    const db = await getConversationDb();

    await db.clear("conversations");
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("initializes with empty conversations list", async () => {
    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    // Wait for async init
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.conversations).toStrictEqual([]);
    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.isPanelOpen).toBe(false);
  });

  it("toggles panel open and closed", async () => {
    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    expect(result.current.isPanelOpen).toBe(false);

    await act(async () => {
      result.current.togglePanel();
    });

    expect(result.current.isPanelOpen).toBe(true);

    await act(async () => {
      result.current.togglePanel();
    });

    expect(result.current.isPanelOpen).toBe(false);
  });

  it("saves current conversation and assigns an ID", async () => {
    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    state.chatHistory = [{ role: "user", content: "hello" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.activeConversationId).not.toBeNull();
    expect(result.current.conversations).toHaveLength(1);
    expect(localStorage.getItem("producer_pal_active_conversation_id")).toBe(
      result.current.activeConversationId,
    );
  });

  it("does not save when chat history is empty", async () => {
    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.conversations).toHaveLength(0);
  });

  it("switches between conversations", async () => {
    const { props, state } = createProps();

    // Pre-populate DB with a conversation
    const existingId = crypto.randomUUID();

    await saveConversation({
      id: existingId,
      createdAt: 1000,
      updatedAt: 1000,
      messages: [{ role: "user", content: "existing conversation" }],
    });

    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Create a current conversation first
    state.chatHistory = [{ role: "user", content: "current" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    // Switch to existing
    await act(async () => {
      await result.current.switchConversation(existingId);
    });

    expect(result.current.activeConversationId).toBe(existingId);
    expect(props.clearConversation).toHaveBeenCalled();
    expect(props.loadConversation).toHaveBeenCalledWith([
      { role: "user", content: "existing conversation" },
    ]);
  });

  it("starts a new conversation", async () => {
    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Save a conversation first
    state.chatHistory = [{ role: "user", content: "hello" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.activeConversationId).not.toBeNull();

    // Start new
    state.chatHistory = [];

    await act(async () => {
      await result.current.startNewConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    expect(props.clearConversation).toHaveBeenCalled();
    expect(
      localStorage.getItem("producer_pal_active_conversation_id"),
    ).toBeNull();
  });

  it("restores last active conversation on mount", async () => {
    const existingId = crypto.randomUUID();

    await saveConversation({
      id: existingId,
      createdAt: 1000,
      updatedAt: 1000,
      messages: [{ role: "user", content: "restored" }],
    });
    localStorage.setItem("producer_pal_active_conversation_id", existingId);

    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeConversationId).toBe(existingId);
    expect(props.loadConversation).toHaveBeenCalledWith([
      { role: "user", content: "restored" },
    ]);
  });

  it("clears stored ID when referenced conversation no longer exists", async () => {
    localStorage.setItem(
      "producer_pal_active_conversation_id",
      "nonexistent-id",
    );

    const { props } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeConversationId).toBeNull();
    expect(
      localStorage.getItem("producer_pal_active_conversation_id"),
    ).toBeNull();
    expect(props.loadConversation).not.toHaveBeenCalled();
  });

  it("preserves createdAt on subsequent saves", async () => {
    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    state.chatHistory = [{ role: "user", content: "hello" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    const firstSave = result.current.conversations[0];

    // Save again with updated content
    state.chatHistory = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    const secondSave = result.current.conversations[0];

    expect(secondSave?.createdAt).toBe(firstSave?.createdAt);
    expect(secondSave?.updatedAt).toBeGreaterThanOrEqual(
      firstSave?.updatedAt ?? 0,
    );
  });

  it("auto-saves current conversation when starting new with existing history", async () => {
    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Create a conversation with history
    state.chatHistory = [{ role: "user", content: "hello" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.conversations).toHaveLength(1);

    // Start new — should auto-save (line 146 coverage)
    state.chatHistory = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    await act(async () => {
      await result.current.startNewConversation();
    });

    expect(result.current.activeConversationId).toBeNull();
    // The original conversation should still be saved
    expect(result.current.conversations).toHaveLength(1);
  });

  it("deletes a conversation and removes it from list", async () => {
    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    state.chatHistory = [{ role: "user", content: "hello" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    const savedId = result.current.activeConversationId!;

    expect(result.current.conversations).toHaveLength(1);

    await act(async () => {
      await result.current.deleteConversation(savedId);
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
    expect(props.clearConversation).toHaveBeenCalled();
  });

  it("deletes a non-active conversation without clearing chat", async () => {
    const otherId = crypto.randomUUID();

    await saveConversation({
      id: otherId,
      createdAt: 1000,
      updatedAt: 1000,
      messages: [{ role: "user", content: "other" }],
    });

    const { props, state } = createProps();
    const { result } = renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Save a current conversation
    state.chatHistory = [{ role: "user", content: "current" }];

    await act(async () => {
      await result.current.saveCurrentConversation();
    });

    expect(result.current.conversations).toHaveLength(2);

    // Delete the other one — should not affect active
    await act(async () => {
      await result.current.deleteConversation(otherId);
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversationId).not.toBeNull();
    expect(props.clearConversation).not.toHaveBeenCalled();
  });

  it("fires beforeunload handler to save conversation", async () => {
    const { props, state } = createProps();

    renderHook(() => useConversations(props));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    state.chatHistory = [{ role: "user", content: "save on unload" }];

    // Trigger beforeunload event
    window.dispatchEvent(new Event("beforeunload"));

    // Give the async save a tick to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify a conversation was saved
    const db = await getConversationDb();
    const all = await db.getAll("conversations");

    expect(all).toHaveLength(1);
    expect(all[0]?.messages).toStrictEqual([
      { role: "user", content: "save on unload" },
    ]);
  });
});
