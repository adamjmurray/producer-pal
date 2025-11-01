/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "../../types/messages.js";
import { MessageList } from "./MessageList.jsx";

// Mock child components
vi.mock("./ActivityIndicator.jsx", () => ({
  ActivityIndicator: () => (
    <div data-testid="activity-indicator">Loading...</div>
  ),
}));

vi.mock("./assistant/AssistantMessage.jsx", () => ({
  AssistantMessage: ({ parts }: { parts: unknown[] }) => (
    <div data-testid="assistant-message">
      {parts.map((p, i: number) => {
        const part = p as { content?: string };
        return <span key={i}>{part.content || ""}</span>;
      })}
    </div>
  ),
}));

describe("MessageList", () => {
  const handleRetry = vi.fn();

  describe("rendering messages", () => {
    it("renders empty list when no messages", () => {
      const { container } = render(
        <MessageList
          messages={[]}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );
      expect(container.querySelector(".space-y-4")).toBeDefined();
    });

    it("renders user message", () => {
      const messages = [
        {
          role: "user" as const,
          parts: [{ type: "text" as const, content: "Hello there" }],
          rawHistoryIndex: 0,
        },
      ];
      const { container } = render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByText("Hello there")).toBeDefined();
      const messageDiv = container.querySelector(".bg-blue-100");
      expect(messageDiv).toBeDefined();
    });

    it("renders error message", () => {
      const messages = [
        {
          role: "model" as const,
          parts: [
            {
              type: "error" as const,
              content: "Something went wrong",
              isError: true as const,
            },
          ],
          rawHistoryIndex: 0,
        },
      ];
      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByText("Something went wrong")).toBeDefined();
    });

    it("renders model message using AssistantMessage component", () => {
      const messages = [
        {
          role: "model" as const,
          parts: [{ type: "text" as const, content: "I can help you" }],
          rawHistoryIndex: 0,
        },
      ];
      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByTestId("assistant-message")).toBeDefined();
    });

    it("renders multiple messages", () => {
      const messages = [
        {
          role: "user" as const,
          parts: [{ type: "text" as const, content: "Hello" }],
          rawHistoryIndex: 0,
        },
        {
          role: "model" as const,
          parts: [{ type: "text" as const, content: "Hi" }],
          rawHistoryIndex: 1,
        },
        {
          role: "user" as const,
          parts: [{ type: "text" as const, content: "How are you?" }],
          rawHistoryIndex: 2,
        },
      ];
      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByText("Hello")).toBeDefined();
      expect(screen.getByText("How are you?")).toBeDefined();
      expect(screen.getByTestId("assistant-message")).toBeDefined();
    });
  });

  describe("message filtering", () => {
    it("filters out messages without content", () => {
      const messages = [
        { role: "user" as const, parts: [], rawHistoryIndex: 0 },
        {
          role: "user" as const,
          parts: [{ type: "text" as const, content: "Valid message" }],
          rawHistoryIndex: 1,
        },
        { role: "model" as const, parts: [], rawHistoryIndex: 2 },
      ];
      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByText("Valid message")).toBeDefined();
      // Should only have one message div
      const { container } = render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );
      expect(container.querySelectorAll(".rounded-lg").length).toBe(1);
    });

    it("filters message with no parts and no content", () => {
      const messages = [
        { role: "user" as const, parts: [], rawHistoryIndex: 0 },
        {
          role: "model" as const,
          rawHistoryIndex: 1,
          parts: undefined,
        } as unknown,
      ] as UIMessage[];
      const { container } = render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(container.querySelectorAll(".rounded-lg").length).toBe(0);
    });
  });

  describe("ActivityIndicator display", () => {
    it("shows ActivityIndicator when assistant is responding", () => {
      render(
        <MessageList
          messages={[]}
          isAssistantResponding={true}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByTestId("activity-indicator")).toBeDefined();
    });

    it("hides ActivityIndicator when assistant is not responding", () => {
      render(
        <MessageList
          messages={[]}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.queryByTestId("activity-indicator")).toBeNull();
    });
  });

  describe("message content formatting", () => {
    it("formats user message with multiple parts", () => {
      const messages = [
        {
          role: "user" as const,
          parts: [
            { type: "text" as const, content: "Part 1 " },
            { type: "text" as const, content: "Part 2" },
          ],
          rawHistoryIndex: 0,
        },
      ];
      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByText("Part 1 Part 2")).toBeDefined();
    });

    it("handles parts with no content", () => {
      const messages = [
        {
          role: "user" as const,
          parts: [
            { type: "text" as const, content: "Hello" },
            {} as unknown,
            { type: "text" as const, content: "World" },
          ] as unknown,
          rawHistoryIndex: 0,
        } as unknown,
      ] as UIMessage[];
      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      expect(screen.getByText("HelloWorld")).toBeDefined();
    });
  });

  describe("message styling", () => {
    it("applies correct classes to user messages", () => {
      const messages = [
        {
          role: "user" as const,
          parts: [{ type: "text" as const, content: "User message" }],
          rawHistoryIndex: 0,
        },
      ];
      const { container } = render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      const messageDiv = container.querySelector(".bg-blue-100");
      expect(messageDiv).toBeDefined();
      expect(messageDiv?.className).toContain("ml-auto");
    });

    it("applies correct classes to error messages", () => {
      const messages = [
        {
          role: "model" as const,
          parts: [
            {
              type: "error" as const,
              content: "Error message",
              isError: true as const,
            },
          ],
          rawHistoryIndex: 0,
        },
      ];
      const { container } = render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      // Check that error is rendered within a model message container
      const messageDiv = container.querySelector(".bg-gray-100");
      expect(messageDiv).toBeDefined();
      expect(screen.getByText("Error message")).toBeDefined();
    });

    it("applies correct classes to model messages", () => {
      const messages = [
        {
          role: "model" as const,
          parts: [{ type: "text" as const, content: "Model message" }],
          rawHistoryIndex: 0,
        },
      ];
      const { container } = render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      const messageDiv = container.querySelector(".bg-gray-100");
      expect(messageDiv).toBeDefined();
    });
  });

  describe("auto-scroll", () => {
    it("includes scroll target div", () => {
      const { container } = render(
        <MessageList
          messages={[]}
          isAssistantResponding={false}
          handleRetry={handleRetry}
        />,
      );

      // The messagesEndRef div should exist
      const divs = container.querySelectorAll("div");
      expect(divs.length).toBeGreaterThan(0);
    });
  });
});
