// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/preact";
import { useConversationPanelState } from "#webui/hooks/chat/helpers/conversations/use-conversation-panel-state";

function createMockDeps() {
  return {
    conversationManager: {
      conversations: [],
      activeConversationId: "conv-1",
      notification: null,
      dismissNotification: vi.fn(),
    },
    transfer: {
      notification: null,
      dismissNotification: vi.fn(),
      handleExportOne: vi.fn().mockResolvedValue(undefined),
      handleExport: vi.fn().mockResolvedValue(undefined),
      handleImport: vi.fn().mockResolvedValue(undefined),
    },
    viewState: {
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection" as const,
    },
    setViewState: vi.fn(),
    handlers: {
      handleNew: vi.fn(),
      handleSelect: vi.fn(),
      handleDelete: vi.fn(),
      handleRename: vi.fn(),
      handleToggleBookmark: vi.fn(),
    },
  };
}

describe("useConversationPanelState", () => {
  it("returns conversations from manager", () => {
    const deps = createMockDeps();
    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    expect(result.current.conversations).toBe(
      deps.conversationManager.conversations,
    );
    expect(result.current.activeConversationId).toBe("conv-1");
  });

  it("exposes search state and a query setter", () => {
    const deps = createMockDeps();
    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    expect(result.current.searchQuery).toBe("");
    expect(result.current.matchedIds).toBeNull();
    expect(typeof result.current.onSearchChange).toBe("function");
  });

  it("onExport calls transfer.handleExport", () => {
    const deps = createMockDeps();
    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    result.current.onExport();
    expect(deps.transfer.handleExport).toHaveBeenCalled();
  });

  it("onImport calls transfer.handleImport", () => {
    const deps = createMockDeps();
    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    result.current.onImport();
    expect(deps.transfer.handleImport).toHaveBeenCalled();
  });

  it("onToggle flips historyPanelOpen", () => {
    const deps = createMockDeps();
    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    result.current.onToggle();
    expect(deps.setViewState).toHaveBeenCalledWith({ historyPanelOpen: true });
  });

  it("onDelete delegates to handlers.handleDelete", () => {
    const deps = createMockDeps();
    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    result.current.onDelete("conv-1");
    expect(deps.handlers.handleDelete).toHaveBeenCalledWith("conv-1");
  });

  it("uses transfer notification when present", () => {
    const deps = createMockDeps();
    const transferNotification = { type: "info" as const, message: "transfer" };

    deps.transfer.notification = transferNotification as never;

    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    expect(result.current.notification).toBe(transferNotification);
    expect(result.current.onDismissNotification).toBe(
      deps.transfer.dismissNotification,
    );
  });

  it("falls back to the conversation-manager notification when no transfer notification", () => {
    const deps = createMockDeps();
    const managerNotification = { type: "info" as const, message: "limit" };

    deps.conversationManager.notification = managerNotification as never;

    const { result } = renderHook(() =>
      useConversationPanelState(deps as never),
    );

    expect(result.current.notification).toBe(managerNotification);
    expect(result.current.onDismissNotification).toBe(
      deps.conversationManager.dismissNotification,
    );
  });
});
