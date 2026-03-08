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
vi.mock(import("#webui/hooks/use-view-state"), () => ({
  useViewState: vi.fn(),
}));

import { useConversations } from "#webui/hooks/chat/use-conversations";
import { useViewState } from "#webui/hooks/use-view-state";
import { setupDefaultMocks } from "./App-test-helpers";
import { App } from "#webui/components/App";

describe("App conversation management", () => {
  const panelOpenViewState = {
    viewState: {
      historyPanelOpen: true,
      settingsOpen: false,
      settingsTab: "connection" as const,
    },
    setViewState: vi.fn(),
  };

  const mockConversations = (overrides: Record<string, unknown>) => {
    (useConversations as ReturnType<typeof vi.fn>).mockReturnValue({
      conversations: [],
      activeConversationId: null,
      saveCurrentConversation: vi.fn(),
      switchConversation: vi.fn(),
      startNewConversation: vi.fn(),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(),
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
    const btn = container
      .querySelector("div[class*='border-l-transparent']")
      ?.querySelector("button");

    if (btn) fireEvent.click(btn);
  };

  it("keeps panel open on new conversation on desktop", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    clickNewConversation();
    expect(panelOpenViewState.setViewState).not.toHaveBeenCalled();
  });

  it("closes panel on new conversation on mobile", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    clickNewConversation();
    expect(panelOpenViewState.setViewState).toHaveBeenCalledWith({
      historyPanelOpen: false,
    });
  });

  it("keeps panel open on select on desktop", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    clickSelectConversation();
    expect(panelOpenViewState.setViewState).not.toHaveBeenCalled();
  });

  it("closes panel on select on mobile", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    clickSelectConversation();
    expect(panelOpenViewState.setViewState).toHaveBeenCalledWith({
      historyPanelOpen: false,
    });
  });

  it("calls deleteConversation on delete button click", () => {
    const mockDelete = vi.fn();

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
    const mockRename = vi.fn();

    mockConversations({
      conversations: [
        { id: "conv-1", title: "Old", createdAt: 1000, updatedAt: 2000 },
      ],
      renameConversation: mockRename,
    });
    const { getByLabelText, container } = render(<App />);

    fireEvent.click(getByLabelText("Rename conversation"));
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.input(input, { target: { value: "New Title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockRename).toHaveBeenCalledWith("conv-1", "New Title");
  });
});
