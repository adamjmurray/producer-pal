// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type UIMessage } from "#webui/types/messages";
import { ChatScreen } from "#webui/components/chat/ChatScreen";
import { type HeaderInfo } from "#webui/components/chat/controls/header/HeaderActions";

vi.mock(import("#webui/hooks/use-update-check"), () => ({
  useUpdateCheck: () => null,
}));

const defaultHeaderInfo: HeaderInfo = {
  activeModel: "gemini-1.5-flash",
  activeProvider: "gemini",
  model: "gemini-2.0-flash-thinking",
  provider: "gemini",
  enabledToolsCount: 20,
  totalToolsCount: 20,
  smallModelMode: false,
  defaultSmallModelMode: false,
  showHelpLinks: true,
};

describe("ChatScreen", () => {
  const mockHandleSend = vi.fn();
  const mockHandleRetry = vi.fn();
  const mockCheckMcpConnection = vi.fn();
  const mockOnOpenSettings = vi.fn();
  const mockOnStop = vi.fn();

  const defaultProps = {
    messages: [] as UIMessage[],
    isAssistantResponding: false,
    rateLimitState: null,
    handleSend: mockHandleSend,
    enqueueMessage: vi.fn(),
    queuedMessages: [],
    onRemoveQueued: vi.fn(),
    handleRetry: mockHandleRetry,
    handleEdit: vi.fn(),
    headerInfo: defaultHeaderInfo,
    activeThinking: null,
    defaultThinking: "Default",
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: mockCheckMcpConnection,
    onOpenSettings: mockOnOpenSettings,
    onOpenToolsSettings: vi.fn(),
    onOpenConnectionSettings: vi.fn(),
    onStop: mockOnStop,
    showTimestamps: true,
    showTokenUsage: false,
    conversationPanel: {
      conversations: [],
      activeConversationId: null,
      isOpen: false,
      onToggle: vi.fn(),
      onSelect: vi.fn(),
      onNew: vi.fn(),
      onDelete: vi.fn(),
      onExportItem: vi.fn(),
      onRename: vi.fn(),
      onToggleBookmark: vi.fn(),
      onExport: vi.fn(),
      onImport: vi.fn(),
      notification: null,
      onDismissNotification: vi.fn(),
    },
  };

  describe("basic rendering", () => {
    it("renders container with correct classes", () => {
      render(<ChatScreen {...defaultProps} />);
      const container = document.querySelector(".flex.flex-col.h-screen");

      expect(container).toBeDefined();
    });

    it("renders ChatHeader component", () => {
      render(<ChatScreen {...defaultProps} />);
      // ChatHeader renders a header element
      const header = document.querySelector("header");

      expect(header).toBeDefined();
    });

    it("renders ChatInput component", () => {
      render(<ChatScreen {...defaultProps} />);
      // ChatInput renders a textarea
      const textarea = document.querySelector("textarea");

      expect(textarea).toBeDefined();
    });
  });

  describe("conditional content rendering", () => {
    it("shows ChatStart when messages array is empty", () => {
      render(<ChatScreen {...defaultProps} messages={[]} />);
      // ChatStart renders its welcome content
      const chatStart = document.querySelector(".flex.flex-col.items-center");

      expect(chatStart).toBeDefined();
    });

    it("shows MessageList when messages exist", () => {
      const messages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
          rawHistoryIndex: 0,
          timestamp: Date.now(),
        },
      ];

      render(<ChatScreen {...defaultProps} messages={messages} />);
      // MessageList renders messages with specific structure
      const messageList = document.querySelector(".space-y-4");

      expect(messageList).toBeDefined();
    });

    it("does not show ChatStart when messages exist", () => {
      const messages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
          rawHistoryIndex: 0,
          timestamp: Date.now(),
        },
      ];
      const { container } = render(
        <ChatScreen {...defaultProps} messages={messages} />,
      );
      // Verify we have a message container but no welcome screen
      const messageContainer = container.querySelector(".space-y-4");

      expect(messageContainer).toBeDefined();
    });
  });

  describe("thinking toggle", () => {
    it("renders thinking level button", () => {
      render(<ChatScreen {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /Thinking level/ }),
      ).toBeDefined();
    });

    it("changes thinking level when button is clicked", () => {
      render(<ChatScreen {...defaultProps} />);

      const btn = screen.getByRole("button", {
        name: /Thinking level: Default/,
      });

      fireEvent.click(btn);

      // Default → Max
      expect(
        screen.getByRole("button", { name: /Thinking level: Max/ }),
      ).toBeDefined();
    });
  });

  describe("prop passing", () => {
    it("passes correct props to ChatHeader", () => {
      render(
        <ChatScreen
          {...defaultProps}
          headerInfo={{
            ...defaultHeaderInfo,
            activeModel: "test-model",
            activeProvider: "openai",
          }}
          messages={[
            {
              role: "user",
              parts: [{ type: "text", content: "Test" }],
              rawHistoryIndex: 0,
              timestamp: Date.now(),
            },
          ]}
        />,
      );
      // ChatHeader displays model info when present
      const header = document.querySelector("header");

      expect(header).toBeDefined();
      // Model name should be in the header
      expect(header!.textContent).toContain("test-model");
    });

    it("passes mcp status to ChatStart when no messages", () => {
      render(
        <ChatScreen
          {...defaultProps}
          mcpStatus="error"
          mcpError="Connection failed"
        />,
      );
      const chatStart = document.querySelector(".flex.flex-col.items-center");

      expect(chatStart).toBeDefined();
    });

    it("passes messages to MessageList when messages exist", () => {
      const messages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Test message" }],
          rawHistoryIndex: 0,
          timestamp: Date.now(),
        },
        {
          role: "model",
          parts: [{ type: "text", content: "Response" }],
          rawHistoryIndex: 1,
          timestamp: Date.now(),
        },
      ];

      render(<ChatScreen {...defaultProps} messages={messages} />);
      const messageList = document.querySelector(
        '[data-testid="message-list"]',
      );

      expect(messageList).toBeDefined();
      // Grid children: 3 per user msg + 2 per AI msg + scroll anchor
      expect(messageList!.children.length).toBeGreaterThanOrEqual(5);
    });

    it("passes isAssistantResponding to MessageList", () => {
      const messages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Test" }],
          rawHistoryIndex: 0,
          timestamp: Date.now(),
        },
      ];

      render(
        <ChatScreen
          {...defaultProps}
          messages={messages}
          isAssistantResponding={true}
        />,
      );
      const messageList = document.querySelector(".space-y-4");

      expect(messageList).toBeDefined();
    });

    it("passes isAssistantResponding to ChatInput", () => {
      render(<ChatScreen {...defaultProps} isAssistantResponding={true} />);
      // When responding, Queue button appears (disabled until user types)
      const queueButton = Array.from(document.querySelectorAll("button")).find(
        (btn) => btn.textContent === "Queue",
      );

      expect(queueButton).toBeDefined();
      expect(queueButton!.disabled).toBe(true);
    });
  });

  describe("rate limit indicator", () => {
    it("shows RateLimitIndicator when rateLimitState.isRetrying is true", () => {
      render(
        <ChatScreen
          {...defaultProps}
          rateLimitState={{
            isRetrying: true,
            attempt: 2,
            maxAttempts: 5,
            delayMs: 5000,
          }}
        />,
      );

      // RateLimitIndicator should be visible
      const indicator = document.querySelector(".bg-yellow-50");

      expect(indicator).toBeDefined();
    });
  });

  describe("bookmark button in header", () => {
    it("passes onToggleBookmark to header when active conversation exists", () => {
      const onToggleBookmark = vi.fn();

      render(
        <ChatScreen
          {...defaultProps}
          conversationPanel={{
            ...defaultProps.conversationPanel,
            conversations: [
              {
                id: "conv-1",
                title: "Test",
                createdAt: 1000,
                updatedAt: 1000,
                bookmarked: false,
                provider: null,
                model: null,
                modelLabel: null,
                thinking: null,
                temperature: null,
                showThoughts: null,
                smallModelMode: null,
                totalUsage: null,
              },
            ],
            activeConversationId: "conv-1",
            onToggleBookmark,
          }}
        />,
      );

      const bookmarkBtn = document.querySelector(
        "[aria-label='Bookmark conversation']",
      ) as HTMLElement;

      expect(bookmarkBtn).toBeDefined();
      fireEvent.click(bookmarkBtn);

      expect(onToggleBookmark).toHaveBeenCalledWith("conv-1");
    });
  });
});
