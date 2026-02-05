// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import type { RenderResult } from "@testing-library/preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "#webui/types/messages";
import { MessageList } from "./MessageList";

// Mock child components
vi.mock(import("./controls/ActivityIndicator"), () => ({
  ActivityIndicator: () => (
    <div data-testid="activity-indicator">Loading...</div>
  ),
}));

vi.mock(import("./assistant/AssistantMessage"), () => ({
  AssistantMessage: ({ parts }: { parts: unknown[] }) => (
    <div data-testid="assistant-message">
      {parts.map((p, i: number) => {
        const part = p as { content?: string };

        return <span key={i}>{part.content ?? ""}</span>;
      })}
    </div>
  ),
}));

function createUserMessage(content: string, rawHistoryIndex = 0): UIMessage {
  return {
    role: "user" as const,
    parts: [{ type: "text" as const, content }],
    rawHistoryIndex,
    timestamp: Date.now(),
  };
}

function createModelMessage(content: string, rawHistoryIndex = 0): UIMessage {
  return {
    role: "model" as const,
    parts: [{ type: "text" as const, content }],
    rawHistoryIndex,
    timestamp: Date.now(),
  };
}

function createErrorMessage(content: string, rawHistoryIndex = 0): UIMessage {
  return {
    role: "model" as const,
    parts: [{ type: "error" as const, content, isError: true as const }],
    rawHistoryIndex,
    timestamp: Date.now(),
  };
}

function renderMessageList(
  messages: UIMessage[] = [],
  isAssistantResponding = false,
  handleRetry = vi.fn(),
): RenderResult & { handleRetry: typeof handleRetry } {
  const result = render(
    <MessageList
      messages={messages}
      isAssistantResponding={isAssistantResponding}
      handleRetry={handleRetry}
    />,
  );

  return { ...result, handleRetry };
}

describe("MessageList", () => {
  describe("rendering messages", () => {
    it("renders empty list when no messages", () => {
      const { container } = renderMessageList();

      expect(container.querySelector(".space-y-4")).toBeDefined();
    });

    it("renders user message", () => {
      const { container } = renderMessageList([
        createUserMessage("Hello there"),
      ]);

      expect(screen.getByText("Hello there")).toBeDefined();
      expect(container.querySelector(".bg-blue-100")).toBeDefined();
    });

    it("renders error message", () => {
      renderMessageList([createErrorMessage("Something went wrong")]);
      expect(screen.getByText("Something went wrong")).toBeDefined();
    });

    it("renders model message using AssistantMessage component", () => {
      renderMessageList([createModelMessage("I can help you")]);
      expect(screen.getByTestId("assistant-message")).toBeDefined();
    });

    it("renders multiple messages", () => {
      renderMessageList([
        createUserMessage("Hello", 0),
        createModelMessage("Hi", 1),
        createUserMessage("How are you?", 2),
      ]);
      expect(screen.getByText("Hello")).toBeDefined();
      expect(screen.getByText("How are you?")).toBeDefined();
      expect(screen.getByTestId("assistant-message")).toBeDefined();
    });
  });

  describe("message filtering", () => {
    it("filters out messages without content", () => {
      const messages: UIMessage[] = [
        { role: "user", parts: [], rawHistoryIndex: 0, timestamp: Date.now() },
        createUserMessage("Valid message", 1),
        { role: "model", parts: [], rawHistoryIndex: 2, timestamp: Date.now() },
      ];

      renderMessageList(messages);
      expect(screen.getByText("Valid message")).toBeDefined();
      const { container } = renderMessageList(messages);

      expect(container.querySelectorAll(".rounded-lg")).toHaveLength(1);
    });

    it("filters message with no parts and no content", () => {
      const messages: UIMessage[] = [
        { role: "user", parts: [], rawHistoryIndex: 0, timestamp: Date.now() },
        { role: "model", rawHistoryIndex: 1, parts: [], timestamp: Date.now() },
      ];
      const { container } = renderMessageList(messages);

      expect(container.querySelectorAll(".rounded-lg")).toHaveLength(0);
    });
  });

  describe("ActivityIndicator display", () => {
    it("shows ActivityIndicator when assistant is responding", () => {
      renderMessageList([], true);
      expect(screen.getByTestId("activity-indicator")).toBeDefined();
    });

    it("hides ActivityIndicator when assistant is not responding", () => {
      renderMessageList([], false);
      expect(screen.queryByTestId("activity-indicator")).toBeNull();
    });
  });

  describe("message content formatting", () => {
    it("formats user message with multiple parts", () => {
      const messages: UIMessage[] = [
        {
          role: "user",
          parts: [
            { type: "text" as const, content: "Part 1 " },
            { type: "text" as const, content: "Part 2" },
          ],
          rawHistoryIndex: 0,
          timestamp: Date.now(),
        },
      ];

      renderMessageList(messages);
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

      renderMessageList(messages);
      expect(screen.getByText("HelloWorld")).toBeDefined();
    });
  });

  describe("message styling", () => {
    it("applies correct classes to user messages", () => {
      const { container } = renderMessageList([
        createUserMessage("User message"),
      ]);
      const messageDiv = container.querySelector(".bg-blue-100");

      expect(messageDiv).toBeDefined();
      expect(messageDiv?.className).toContain("ml-auto");
    });

    it("applies correct classes to error messages", () => {
      const { container } = renderMessageList([
        createErrorMessage("Error message"),
      ]);

      expect(container.querySelector(".bg-gray-100")).toBeDefined();
      expect(screen.getByText("Error message")).toBeDefined();
    });

    it("applies correct classes to model messages", () => {
      const { container } = renderMessageList([
        createModelMessage("Model message"),
      ]);

      expect(container.querySelector(".bg-gray-100")).toBeDefined();
    });
  });

  describe("auto-scroll", () => {
    it("includes scroll target div", () => {
      const { container } = renderMessageList();

      expect(container.querySelectorAll("div").length).toBeGreaterThan(0);
    });
  });

  describe("retry functionality", () => {
    it("shows retry button for model messages when not responding", () => {
      renderMessageList([
        createUserMessage("Hello", 0),
        createModelMessage("Hi there", 1),
      ]);
      expect(screen.getByTitle("Retry from your last message")).toBeDefined();
    });

    it("hides retry button when assistant is responding", () => {
      renderMessageList(
        [createUserMessage("Hello", 0), createModelMessage("Hi there", 1)],
        true,
      );
      expect(screen.queryByTitle("Retry from your last message")).toBeNull();
    });

    it("calls handleRetry with previous user message index when clicked", () => {
      const handleRetryMock = vi.fn();

      renderMessageList(
        [
          createUserMessage("First question", 0),
          createModelMessage("First answer", 1),
        ],
        false,
        handleRetryMock,
      );
      fireEvent.click(screen.getByTitle("Retry from your last message"));
      expect(handleRetryMock).toHaveBeenCalledExactlyOnceWith(0);
    });

    it("does not show retry button when there is no previous user message", () => {
      renderMessageList([createModelMessage("Hello")]);
      expect(screen.queryByTitle("Retry from your last message")).toBeNull();
    });

    it("finds correct user message index for retry when empty messages exist", () => {
      const handleRetryMock = vi.fn();
      const messages: UIMessage[] = [
        { role: "user", parts: [], rawHistoryIndex: 0, timestamp: Date.now() },
        createUserMessage("Hello", 1),
        createModelMessage("Response", 2),
      ];

      renderMessageList(messages, false, handleRetryMock);
      fireEvent.click(screen.getByTitle("Retry from your last message"));
      expect(handleRetryMock).toHaveBeenCalledExactlyOnceWith(1);
    });
  });
});
