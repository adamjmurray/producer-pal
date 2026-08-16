// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock App's hook dependencies (vi.mock must be per-file, mirrors App.test.tsx)
vi.mock(import("#webui/hooks/chat/use-chat"), () => ({ useChat: vi.fn() }));
vi.mock(import("#webui/hooks/chat/use-conversations"), () => ({
  useConversations: vi.fn(),
}));
vi.mock(import("#webui/hooks/connection/use-mcp-connection"), () => ({
  useMcpConnection: vi.fn(),
}));
vi.mock(import("#webui/hooks/connection/use-remote-config"), () => ({
  useRemoteConfig: vi.fn(),
}));
vi.mock(import("#webui/hooks/settings/use-settings"), () => ({
  useSettings: vi.fn(),
}));
vi.mock(import("#webui/hooks/theme/use-theme"), () => ({ useTheme: vi.fn() }));
vi.mock(import("#webui/hooks/connection/use-update-check"), () => ({
  useUpdateCheck: () => ({ update: null, dismissUpdate: () => {} }),
}));
vi.mock(import("#webui/hooks/view-state/use-view-state"), () => ({
  useViewState: vi.fn(),
}));

// App renders the real ContextTabs + system-prompt hook, both of which fetch a
// same-origin endpoint; stub them so these tests don't leak real localhost
// fetches. See App-context-mocks for details.
vi.mock(import("#webui/hooks/context/use-system-prompt"), () => ({
  useSystemPrompt: systemPromptDocMock,
}));
vi.mock(import("#webui/components/context/ContextTabs"), () => ({
  ContextTabs: ContextTabsStub,
}));

import { ContextTabsStub, systemPromptDocMock } from "./App-context-mocks";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { useViewState } from "#webui/hooks/view-state/use-view-state";
import { mockChatHook, setupDefaultMocks } from "./App-test-helpers";
import { App } from "#webui/components/App";

/**
 * Stub `matchMedia` for the mobile check. The chat input's CodeMirror also
 * subscribes to a print query, so the stub needs `addEventListener`.
 * @param matches - What every media query reports
 */
function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

describe("App conversation management", () => {
  const panelOpenViewState = {
    viewState: {
      historyPanelOpen: true,
      settingsOpen: false,
      settingsTab: "connection" as const,
    },
    setViewState: vi.fn(),
  };

  const asyncMock = () => vi.fn().mockResolvedValue(undefined);

  const mockConversations = (overrides: Record<string, unknown>) => {
    (useConversations as ReturnType<typeof vi.fn>).mockReturnValue({
      conversations: [],
      activeConversationId: null,
      saveCurrentConversation: asyncMock(),
      switchConversation: asyncMock(),
      startNewConversation: asyncMock(),
      deleteConversation: asyncMock(),
      renameConversation: asyncMock(),
      toggleBookmark: asyncMock(),
      ...overrides,
    });
    (useViewState as ReturnType<typeof vi.fn>).mockReturnValue(
      panelOpenViewState,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  const clickNewConversation = () => {
    mockConversations({});
    const { container } = render(<App />);
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("New Conversation"),
    );

    if (btn) fireEvent.click(btn);
  };

  const clickSelectConversation = () => {
    mockConversations({
      conversations: [
        { id: "conv-1", title: null, createdAt: 1000, updatedAt: 2000 },
      ],
    });
    const { container } = render(<App />);
    const btn = container.querySelector(
      "button[class*='border-l-transparent']",
    );

    if (btn) fireEvent.click(btn);
  };

  it("keeps panel open on new conversation on desktop", () => {
    mockMatchMedia(false);
    clickNewConversation();
    expect(panelOpenViewState.setViewState).not.toHaveBeenCalled();
  });

  it("closes panel on new conversation on mobile", () => {
    mockMatchMedia(true);
    clickNewConversation();
    expect(panelOpenViewState.setViewState).toHaveBeenCalledWith({
      historyPanelOpen: false,
    });
  });

  it("keeps panel open on select on desktop", () => {
    mockMatchMedia(false);
    clickSelectConversation();
    expect(panelOpenViewState.setViewState).not.toHaveBeenCalled();
  });

  it("closes panel on select on mobile", () => {
    mockMatchMedia(true);
    clickSelectConversation();
    expect(panelOpenViewState.setViewState).toHaveBeenCalledWith({
      historyPanelOpen: false,
    });
  });

  it("calls deleteConversation on delete button click", () => {
    const mockDelete = asyncMock();

    mockConversations({
      conversations: [
        { id: "conv-1", title: null, createdAt: 1000, updatedAt: 2000 },
      ],
      deleteConversation: mockDelete,
    });
    const { getByLabelText } = render(<App />);

    fireEvent.click(getByLabelText("Delete conversation"));
    expect(mockDelete).toHaveBeenCalledWith("conv-1");
  });

  it("calls renameConversation on rename", () => {
    const mockRename = asyncMock();

    mockConversations({
      conversations: [
        { id: "conv-1", title: "Old", createdAt: 1000, updatedAt: 2000 },
      ],
      renameConversation: mockRename,
    });
    const { getByLabelText } = render(<App />);

    fireEvent.click(getByLabelText("Rename conversation"));
    const input = getByLabelText("Conversation title") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "New Title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRename).toHaveBeenCalledWith("conv-1", "New Title");
  });

  it("calls toggleBookmark on bookmark button click", () => {
    const mockToggleBookmark = asyncMock();

    mockConversations({
      conversations: [
        { id: "conv-1", title: null, createdAt: 1000, updatedAt: 2000 },
      ],
      toggleBookmark: mockToggleBookmark,
    });
    const { getAllByLabelText } = render(<App />);
    const bookmarkButtons = getAllByLabelText("Bookmark conversation");

    // Click the panel bookmark button (last one; header button is first but disabled)
    fireEvent.click(bookmarkButtons.at(-1)!);
    expect(mockToggleBookmark).toHaveBeenCalledWith("conv-1");
  });

  it("auto-saves when streaming completes (isAssistantResponding false)", () => {
    const mockSave = vi.fn();

    mockConversations({ saveCurrentConversation: mockSave });

    const oneMessage = [
      {
        id: "1",
        role: "user",
        content: "hello",
        parts: [{ type: "text", content: "hello" }],
      },
    ];

    // Start with streaming active
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockChatHook,
      messages: oneMessage,
      isAssistantResponding: true,
    });
    const { rerender } = render(<App />);

    mockSave.mockClear();

    // Streaming ends — same message count but content updated (merged tool results)
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockChatHook,
      messages: oneMessage,
      isAssistantResponding: false,
    });
    rerender(<App />);

    expect(mockSave).toHaveBeenCalledWith(expect.any(Number));
  });

  it("does not auto-save when streaming starts", () => {
    const mockSave = vi.fn();

    mockConversations({ saveCurrentConversation: mockSave });

    const { rerender } = render(<App />);

    mockSave.mockClear();

    // Streaming starts — should not trigger a save
    (useChat as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockChatHook,
      isAssistantResponding: true,
    });
    rerender(<App />);

    expect(mockSave).not.toHaveBeenCalled();
  });
});
