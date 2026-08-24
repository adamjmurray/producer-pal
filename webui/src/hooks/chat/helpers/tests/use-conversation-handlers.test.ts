// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type UseConversationsReturn } from "#webui/hooks/chat/use-conversations";
import { useConversationHandlers } from "#webui/hooks/chat/helpers/conversations/use-conversation-handlers";

/**
 * Create a mock conversation manager with async methods.
 * @param overrides - Optional method overrides
 * @returns Mock manager
 */
function createMockManager(
  overrides: Partial<UseConversationsReturn> = {},
): UseConversationsReturn {
  return {
    conversations: [],
    activeConversationId: null,
    notification: null,
    dismissNotification: vi.fn(),
    saveCurrentConversation: vi.fn().mockResolvedValue(undefined),
    switchConversation: vi.fn().mockResolvedValue(undefined),
    startNewConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    deleteAllConversations: vi.fn().mockResolvedValue(undefined),
    deleteUnbookmarkedConversations: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    toggleBookmark: vi.fn().mockResolvedValue(undefined),
    refreshList: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Render the handlers over a fresh mock manager and its two callback spies.
 * @param overrides - Manager method overrides
 * @returns The manager, both spies, and the hook result handle
 */
function renderHandlers(overrides: Partial<UseConversationsReturn> = {}) {
  const manager = createMockManager(overrides);
  const stop = vi.fn();
  const clearViewingMode = vi.fn();
  const { result } = renderHook(() =>
    useConversationHandlers(manager, stop, clearViewingMode),
  );

  return { manager, stop, clearViewingMode, result };
}

describe("useConversationHandlers", () => {
  it("logs rejected promises to console.error", async () => {
    const error = new Error("IndexedDB failure");
    const { result } = renderHandlers({
      deleteConversation: vi.fn().mockRejectedValue(error),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(() => result.current.handleDelete("conv-1"));

    // Wait for the microtask (.catch runs async)
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith(error);
    spy.mockRestore();
  });

  it("stops response before delegating to deleteConversation for the active id", async () => {
    // Deleting the actively-streaming conversation must stop the stream first
    // (like new/select/delete-all) so no further autosave writes the record
    // back to the DB after it is removed.
    const { manager, stop, result } = renderHandlers({
      activeConversationId: "conv-1",
    });

    await act(() => result.current.handleDelete("conv-1"));

    expect(stop).toHaveBeenCalled();
    expect(manager.deleteConversation).toHaveBeenCalledWith("conv-1");
  });

  it("does not stop response when deleting a non-active conversation", async () => {
    // A non-active row has no pending autosave (saves only ever target the
    // active id), so stopping would only abort the user's in-flight response on
    // the active conversation and — mid-fork — risk overwriting the source
    // record. The delete must still proceed.
    const { manager, stop, result } = renderHandlers({
      activeConversationId: "active-conv",
    });

    await act(() => result.current.handleDelete("other-conv"));

    expect(stop).not.toHaveBeenCalled();
    expect(manager.deleteConversation).toHaveBeenCalledWith("other-conv");
  });

  it("stops response when selecting a conversation", async () => {
    const { manager, stop, result } = renderHandlers();

    await act(() => result.current.handleSelect("conv-1"));

    expect(stop).toHaveBeenCalled();
    expect(manager.switchConversation).toHaveBeenCalledWith("conv-1");
  });

  it("stops response when starting a new conversation", () => {
    const { manager, stop, result } = renderHandlers();

    result.current.handleNew();

    expect(stop).toHaveBeenCalled();
    expect(manager.startNewConversation).toHaveBeenCalled();
  });

  it("clears the foreign-mode view override when starting a new conversation", () => {
    const { clearViewingMode, result } = renderHandlers();

    result.current.handleNew();

    expect(clearViewingMode).toHaveBeenCalledOnce();
  });

  it("stops response and delegates to deleteAllConversations", () => {
    const { manager, stop, result } = renderHandlers();

    result.current.handleDeleteAll();

    expect(stop).toHaveBeenCalled();
    expect(manager.deleteAllConversations).toHaveBeenCalled();
  });

  it("stops response and delegates to deleteUnbookmarkedConversations", () => {
    const { manager, stop, result } = renderHandlers();

    result.current.handleDeleteUnbookmarked();

    expect(stop).toHaveBeenCalled();
    expect(manager.deleteUnbookmarkedConversations).toHaveBeenCalled();
  });
});
