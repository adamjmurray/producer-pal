// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import {
  type RenderResult,
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type UIMessage } from "#webui/types/messages";
import { MessageList } from "#webui/components/chat/MessageList";

// Mock child components
vi.mock(import("#webui/components/chat/controls/ActivityIndicator"), () => ({
  ActivityIndicator: () => (
    <div data-testid="activity-indicator">Loading...</div>
  ),
}));

vi.mock(import("#webui/components/chat/assistant/AssistantMessage"), () => ({
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
  showTimestamps = true,
  handleEdit = vi.fn(),
  showTokenUsage = false,
): RenderResult & {
  handleRetry: typeof handleRetry;
  handleEdit: typeof handleEdit;
} {
  const result = render(
    <MessageList
      messages={messages}
      isAssistantResponding={isAssistantResponding}
      handleRetry={handleRetry}
      handleEdit={handleEdit}
      showTimestamps={showTimestamps}
      showTokenUsage={showTokenUsage}
    />,
  );

  return { ...result, handleRetry, handleEdit };
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
    });

    it("applies correct classes to error messages", () => {
      const { container } = renderMessageList([
        createErrorMessage("Error message"),
      ]);

      expect(container.querySelector(".bg-zinc-100")).toBeDefined();
      expect(screen.getByText("Error message")).toBeDefined();
    });

    it("applies correct classes to model messages", () => {
      const { container } = renderMessageList([
        createModelMessage("Model message"),
      ]);

      expect(container.querySelector(".bg-zinc-100")).toBeDefined();
    });
  });

  describe("timestamps", () => {
    it("renders visible timestamps for messages", () => {
      renderMessageList([
        createUserMessage("Hello", 0),
        createModelMessage("Hi", 1),
      ]);
      const timestamps = screen.getAllByTestId("message-timestamp");

      expect(timestamps).toHaveLength(2);
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

  describe("edit functionality", () => {
    it("shows edit button for user messages when not responding", () => {
      renderMessageList([createUserMessage("Hello", 0)]);
      expect(screen.getByTitle("Edit message")).toBeDefined();
    });

    it("hides edit button when assistant is responding", () => {
      renderMessageList([createUserMessage("Hello", 0)], true);
      expect(screen.queryByTitle("Edit message")).toBeNull();
    });

    it("clicking edit button shows textarea with message content", () => {
      renderMessageList([createUserMessage("Hello world", 0)]);
      fireEvent.click(screen.getByTitle("Edit message"));

      const textarea = screen.getByTestId("edit-message-textarea");

      expect(textarea).toBeDefined();
      expect((textarea as HTMLTextAreaElement).value).toBe("Hello world");
    });

    it("cancel button reverts to display mode", () => {
      renderMessageList([createUserMessage("Hello", 0)]);
      fireEvent.click(screen.getByTitle("Edit message"));

      expect(screen.getByTestId("edit-message-textarea")).toBeDefined();

      fireEvent.click(screen.getByText("Cancel"));

      expect(screen.queryByTestId("edit-message-textarea")).toBeNull();
      expect(screen.getByText("Hello")).toBeDefined();
    });

    it("Save & Send calls handleEdit with correct index and text", () => {
      const handleEditMock = vi.fn();

      renderMessageList(
        [createUserMessage("Original", 0)],
        false,
        vi.fn(),
        true,
        handleEditMock,
      );
      fireEvent.click(screen.getByTitle("Edit message"));

      const textarea = screen.getByTestId("edit-message-textarea");

      fireEvent.input(textarea, { target: { value: "Edited message" } });
      fireEvent.click(screen.getByTestId("edit-message-save"));

      expect(handleEditMock).toHaveBeenCalledExactlyOnceWith(
        0,
        "Edited message",
      );
    });

    it("Save & Send button is disabled when textarea is empty", () => {
      renderMessageList([createUserMessage("Hello", 0)]);
      fireEvent.click(screen.getByTitle("Edit message"));

      const textarea = screen.getByTestId("edit-message-textarea");

      fireEvent.input(textarea, { target: { value: "" } });

      const saveButton = screen.getByTestId("edit-message-save");

      expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    });

    it("does not show edit button for model messages", () => {
      renderMessageList([createModelMessage("Response", 0)]);
      expect(screen.queryByTitle("Edit message")).toBeNull();
    });

    it("clears editing state when assistant starts responding", () => {
      const { rerender } = renderMessageList([createUserMessage("Hello", 0)]);

      fireEvent.click(screen.getByTitle("Edit message"));
      expect(screen.getByTestId("edit-message-textarea")).toBeDefined();

      rerender(
        <MessageList
          messages={[createUserMessage("Hello", 0)]}
          isAssistantResponding={true}
          handleRetry={vi.fn()}
          handleEdit={vi.fn()}
          showTimestamps={true}
          showTokenUsage={false}
        />,
      );

      expect(screen.queryByTestId("edit-message-textarea")).toBeNull();
    });
  });

  describe("still thinking indicator", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("shows 'Still thinking...' after delay when responding with no content", async () => {
      renderMessageList([], true);
      expect(screen.queryByText("Still thinking...")).toBeNull();

      await act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("Still thinking...")).toBeDefined();
    });

    it("does not show before delay elapses", async () => {
      renderMessageList([], true);

      await act(() => {
        vi.advanceTimersByTime(3999);
      });
      expect(screen.queryByText("Still thinking...")).toBeNull();
    });

    it.each<[string, UIMessage[], boolean]>([
      ["assistant message gains content", [createModelMessage("Hello")], true],
      ["responding ends", [], false],
    ])(
      "disappears when %s",
      async (_label, messages, isAssistantResponding) => {
        const { rerender } = renderMessageList([], true);

        await act(() => {
          vi.advanceTimersByTime(4000);
        });
        expect(screen.getByText("Still thinking...")).toBeDefined();

        rerender(
          <MessageList
            messages={messages}
            isAssistantResponding={isAssistantResponding}
            handleRetry={vi.fn()}
            handleEdit={vi.fn()}
            showTimestamps={true}
            showTokenUsage={false}
          />,
        );
        expect(screen.queryByText("Still thinking...")).toBeNull();
      },
    );

    it("does not appear if content arrives before delay", async () => {
      const { rerender } = renderMessageList([], true);

      await act(() => {
        vi.advanceTimersByTime(2000);
      });

      rerender(
        <MessageList
          messages={[createModelMessage("Fast response")]}
          isAssistantResponding={true}
          handleRetry={vi.fn()}
          handleEdit={vi.fn()}
          showTimestamps={true}
          showTokenUsage={false}
        />,
      );

      await act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText("Still thinking...")).toBeNull();
    });

    it("reappears after content when messages stop updating", async () => {
      const { rerender } = renderMessageList([], true);

      // First thinking phase
      await act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("Still thinking...")).toBeDefined();

      // Content arrives (e.g., text + tool call)
      const messagesWithContent = [createModelMessage("Calling tool...", 1)];

      rerender(
        <MessageList
          messages={messagesWithContent}
          isAssistantResponding={true}
          handleRetry={vi.fn()}
          handleEdit={vi.fn()}
          showTimestamps={true}
          showTokenUsage={false}
        />,
      );
      expect(screen.queryByText("Still thinking...")).toBeNull();

      // Messages stop updating (model thinking again) — should reappear
      await act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText("Still thinking...")).toBeDefined();
    });
  });

  describe("ModelMismatchLabel", () => {
    it("shows mismatch label when response model differs from requested", () => {
      const messages = [
        {
          ...createModelMessage("Hi"),
          responseModel: "gpt-4o-mini-2024-07-18",
        },
      ];

      render(
        <MessageList
          messages={messages}
          isAssistantResponding={false}
          handleRetry={vi.fn()}
          handleEdit={vi.fn()}
          showTimestamps={false}
          showTokenUsage={false}
          requestedModel="gpt-4o"
        />,
      );

      expect(screen.getByText(/responded as gpt-4o-mini/)).toBeDefined();
    });
  });

  describe("TokenUsageLabel", () => {
    it("shows usage when enabled and message has usage data", () => {
      const messages = [
        {
          ...createModelMessage("Hi"),
          usage: { inputTokens: 9496, outputTokens: 178 },
        },
      ];

      renderMessageList(messages, false, vi.fn(), false, vi.fn(), true);

      expect(screen.getByText(/9.5K/)).toBeDefined();
      expect(screen.getByText(/178/)).toBeDefined();
    });

    it("hides usage when disabled even if message has usage data", () => {
      const messages = [
        {
          ...createModelMessage("Hi"),
          usage: { inputTokens: 9496, outputTokens: 178 },
        },
      ];

      renderMessageList(messages, false, vi.fn(), false, vi.fn(), false);

      expect(screen.queryByText(/9.5K/)).toBeNull();
    });

    it("shows nothing when enabled but message has no usage", () => {
      const messages = [createModelMessage("Hi")];

      renderMessageList(messages, false, vi.fn(), false, vi.fn(), true);

      expect(screen.queryByText(/tokens/)).toBeNull();
    });

    it("shows reasoning tokens when present", () => {
      const messages = [
        {
          ...createModelMessage("Hi"),
          usage: { inputTokens: 9496, outputTokens: 178, reasoningTokens: 101 },
        },
      ];

      renderMessageList(messages, false, vi.fn(), false, vi.fn(), true);

      expect(screen.getByText(/101 reasoning/)).toBeDefined();
    });
  });
});
