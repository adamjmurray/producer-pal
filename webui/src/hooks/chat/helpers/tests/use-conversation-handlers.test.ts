// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
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
 * @param isAssistantResponding - Whether a response is streaming
 * @returns The manager, both spies, and the hook result handle
 */
function renderHandlers(
  overrides: Partial<UseConversationsReturn> = {},
  isAssistantResponding = false,
) {
  const manager = createMockManager(overrides);
  const stop = vi.fn();
  const clearViewingMode = vi.fn();
  const { result } = renderHook(() =>
    useConversationHandlers(
      manager,
      stop,
      clearViewingMode,
      isAssistantResponding,
    ),
  );

  return { manager, stop, clearViewingMode, result };
}

/**
 * Install a window.confirm answering the given way (happy-dom defines none).
 * @param answer - What the user clicks
 * @returns The stubbed confirm
 */
function stubConfirm(answer: boolean) {
  const confirmed = vi.fn(() => answer);

  vi.stubGlobal("confirm", confirmed);

  return confirmed;
}

describe("useConversationHandlers", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("asks before a switch cuts a streaming response off", async () => {
    const confirmed = stubConfirm(true);
    const { manager, stop, result } = renderHandlers({}, true);

    await act(() => result.current.handleSelect("conv-1"));

    expect(confirmed).toHaveBeenCalledWith(
      "This will stop the response in progress. Continue?",
    );
    expect(stop).toHaveBeenCalled();
    expect(manager.switchConversation).toHaveBeenCalledWith("conv-1");
  });

  it("leaves the response alone when the switch is declined", async () => {
    stubConfirm(false);
    const { manager, stop, result } = renderHandlers({}, true);

    await act(() => result.current.handleSelect("conv-1"));

    expect(stop).not.toHaveBeenCalled();
    expect(manager.switchConversation).not.toHaveBeenCalled();
  });

  it("leaves the response alone when a new conversation is declined", async () => {
    stubConfirm(false);
    const { manager, stop, clearViewingMode, result } = renderHandlers(
      {},
      true,
    );

    await act(() => result.current.handleNew());

    expect(stop).not.toHaveBeenCalled();
    expect(manager.startNewConversation).not.toHaveBeenCalled();
    expect(clearViewingMode).not.toHaveBeenCalled();
  });

  it("does not ask when nothing is streaming", async () => {
    const confirmed = stubConfirm(true);
    const { manager, result } = renderHandlers();

    await act(() => result.current.handleNew());
    await act(() => result.current.handleSelect("conv-1"));

    expect(confirmed).not.toHaveBeenCalled();
    expect(manager.startNewConversation).toHaveBeenCalled();
    expect(manager.switchConversation).toHaveBeenCalledWith("conv-1");
  });

  it("does not ask before a delete, which undo already covers", async () => {
    const confirmed = stubConfirm(true);
    const { manager, stop, result } = renderHandlers(
      { activeConversationId: "conv-1" },
      true,
    );

    await act(() => result.current.handleDelete("conv-1"));

    expect(confirmed).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(manager.deleteConversation).toHaveBeenCalledWith("conv-1");
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
