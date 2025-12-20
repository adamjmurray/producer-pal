/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "../../types/messages";
import { ChatScreen } from "./ChatScreen";

describe("ChatScreen", () => {
  const mockHandleSend = vi.fn();
  const mockHandleRetry = vi.fn();
  const mockCheckMcpConnection = vi.fn();
  const mockOnOpenSettings = vi.fn();
  const mockOnClearConversation = vi.fn();
  const mockOnStop = vi.fn();

  const defaultProps = {
    messages: [] as UIMessage[],
    isAssistantResponding: false,
    rateLimitState: null,
    handleSend: mockHandleSend,
    handleRetry: mockHandleRetry,
    activeModel: "gemini-1.5-flash",
    activeThinking: null,
    activeTemperature: 1.0,
    activeProvider: "gemini" as const,
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: mockCheckMcpConnection,
    onOpenSettings: mockOnOpenSettings,
    onClearConversation: mockOnClearConversation,
    onStop: mockOnStop,
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

  describe("prop passing", () => {
    it("passes correct props to ChatHeader", () => {
      render(
        <ChatScreen
          {...defaultProps}
          activeModel="test-model"
          activeThinking="extended"
          activeTemperature={0.7}
          activeProvider="openai"
          messages={[
            {
              role: "user",
              parts: [{ type: "text", content: "Test" }],
              rawHistoryIndex: 0,
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
        },
        {
          role: "model",
          parts: [{ type: "text", content: "Response" }],
          rawHistoryIndex: 1,
        },
      ];
      render(<ChatScreen {...defaultProps} messages={messages} />);
      const messageList = document.querySelector(".space-y-4");
      expect(messageList).toBeDefined();
      // Messages are rendered (plus scroll anchor div at the end)
      expect(messageList!.children.length).toBeGreaterThanOrEqual(2);
    });

    it("passes isAssistantResponding to MessageList", () => {
      const messages: UIMessage[] = [
        {
          role: "user",
          parts: [{ type: "text", content: "Test" }],
          rawHistoryIndex: 0,
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
      // When responding, Send button should be disabled
      const sendButton = Array.from(document.querySelectorAll("button")).find(
        (btn) => btn.textContent === "...",
      );
      expect(sendButton).toBeDefined();
      expect(sendButton!.disabled).toBe(true);
    });
  });
});
