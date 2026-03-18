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
import { useConversationHandlers } from "./use-conversation-handlers";

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
    limitNotification: null,
    dismissLimitNotification: vi.fn(),
    saveCurrentConversation: vi.fn().mockResolvedValue(undefined),
    switchConversation: vi.fn().mockResolvedValue(undefined),
    startNewConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    toggleBookmark: vi.fn().mockResolvedValue(undefined),
    refreshList: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useConversationHandlers", () => {
  const stopResponse = vi.fn();

  it("logs rejected promises to console.error", async () => {
    const error = new Error("IndexedDB failure");
    const manager = createMockManager({
      deleteConversation: vi.fn().mockRejectedValue(error),
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useConversationHandlers(manager, stopResponse),
    );

    await act(() => result.current.handleDelete("conv-1"));

    // Wait for the microtask (.catch runs async)
    await new Promise((r) => setTimeout(r, 0));

    expect(spy).toHaveBeenCalledWith(error);
    spy.mockRestore();
  });

  it("stops response when selecting a conversation", async () => {
    const manager = createMockManager();
    const stop = vi.fn();

    const { result } = renderHook(() => useConversationHandlers(manager, stop));

    await act(() => result.current.handleSelect("conv-1"));

    expect(stop).toHaveBeenCalled();
    expect(manager.switchConversation).toHaveBeenCalledWith("conv-1");
  });

  it("stops response when starting a new conversation", () => {
    const manager = createMockManager();
    const stop = vi.fn();

    const { result } = renderHook(() => useConversationHandlers(manager, stop));

    result.current.handleNew();

    expect(stop).toHaveBeenCalled();
    expect(manager.startNewConversation).toHaveBeenCalled();
  });
});
