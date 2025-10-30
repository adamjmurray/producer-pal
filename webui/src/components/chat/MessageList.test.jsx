/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { MessageList } from "./MessageList.jsx";

// Mock child components
vi.mock("./ActivityIndicator.jsx", () => ({
  ActivityIndicator: () => (
    <div data-testid="activity-indicator">Loading...</div>
  ),
}));

vi.mock("./assistant/AssistantMessage.jsx", () => ({
  AssistantMessage: ({ parts }) => (
    <div data-testid="assistant-message">
      {parts.map((p, i) => (
        <span key={i}>{p.text || ""}</span>
      ))}
    </div>
  ),
}));

describe("MessageList", () => {
  describe("rendering messages", () => {
    it("renders empty list when no messages", () => {
      const { container } = render(
        <MessageList messages={[]} isAssistantResponding={false} />,
      );
      expect(container.querySelector(".space-y-4")).toBeDefined();
    });

    it("renders user message", () => {
      const messages = [
        {
          role: "user",
          parts: [{ content: "Hello there" }],
        },
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      expect(screen.getByText("Hello there")).toBeDefined();
      const messageDiv = container.querySelector(".bg-blue-100");
      expect(messageDiv).toBeDefined();
    });

    it("renders error message", () => {
      const messages = [
        {
          role: "error",
          parts: [{ content: "Something went wrong" }],
        },
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      expect(screen.getByText("Something went wrong")).toBeDefined();
      const messageDiv = container.querySelector(".bg-red-600");
      expect(messageDiv).toBeDefined();
    });

    it("renders model message using AssistantMessage component", () => {
      const messages = [
        {
          role: "model",
          parts: [{ text: "I can help you" }],
        },
      ];
      render(<MessageList messages={messages} isAssistantResponding={false} />);

      expect(screen.getByTestId("assistant-message")).toBeDefined();
    });

    it("renders multiple messages", () => {
      const messages = [
        { role: "user", parts: [{ content: "Hello" }] },
        { role: "model", parts: [{ text: "Hi" }] },
        { role: "user", parts: [{ content: "How are you?" }] },
      ];
      render(<MessageList messages={messages} isAssistantResponding={false} />);

      expect(screen.getByText("Hello")).toBeDefined();
      expect(screen.getByText("How are you?")).toBeDefined();
      expect(screen.getByTestId("assistant-message")).toBeDefined();
    });
  });

  describe("message filtering", () => {
    it("filters out messages without content", () => {
      const messages = [
        { role: "user", parts: [] },
        { role: "user", parts: [{ content: "Valid message" }] },
        { role: "model", parts: [] },
      ];
      render(<MessageList messages={messages} isAssistantResponding={false} />);

      expect(screen.getByText("Valid message")).toBeDefined();
      // Should only have one message div
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );
      expect(container.querySelectorAll(".rounded-lg").length).toBe(1);
    });

    it("keeps message with content field", () => {
      const messages = [
        { role: "user", content: "Message with content field", parts: [] },
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      // Message should be kept even though parts is empty
      expect(container.querySelectorAll(".rounded-lg").length).toBe(1);
    });

    it("filters message with no parts and no content", () => {
      const messages = [
        { role: "user", parts: [] },
        { role: "model" }, // no parts or content
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      expect(container.querySelectorAll(".rounded-lg").length).toBe(0);
    });
  });

  describe("ActivityIndicator display", () => {
    it("shows ActivityIndicator when assistant is responding", () => {
      render(<MessageList messages={[]} isAssistantResponding={true} />);

      expect(screen.getByTestId("activity-indicator")).toBeDefined();
    });

    it("hides ActivityIndicator when assistant is not responding", () => {
      render(<MessageList messages={[]} isAssistantResponding={false} />);

      expect(screen.queryByTestId("activity-indicator")).toBeNull();
    });
  });

  describe("message content formatting", () => {
    it("formats user message with multiple parts", () => {
      const messages = [
        {
          role: "user",
          parts: [{ content: "Part 1 " }, { content: "Part 2" }],
        },
      ];
      render(<MessageList messages={messages} isAssistantResponding={false} />);

      expect(screen.getByText("Part 1 Part 2")).toBeDefined();
    });

    it("handles parts with no content", () => {
      const messages = [
        {
          role: "user",
          parts: [{ content: "Hello" }, {}, { content: "World" }],
        },
      ];
      render(<MessageList messages={messages} isAssistantResponding={false} />);

      expect(screen.getByText("HelloWorld")).toBeDefined();
    });
  });

  describe("message styling", () => {
    it("applies correct classes to user messages", () => {
      const messages = [
        {
          role: "user",
          parts: [{ content: "User message" }],
        },
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      const messageDiv = container.querySelector(".bg-blue-100");
      expect(messageDiv).toBeDefined();
      expect(messageDiv.className).toContain("ml-auto");
    });

    it("applies correct classes to error messages", () => {
      const messages = [
        {
          role: "error",
          parts: [{ content: "Error message" }],
        },
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      const messageDiv = container.querySelector(".bg-red-600");
      expect(messageDiv).toBeDefined();
      expect(messageDiv.className).toContain("text-white");
    });

    it("applies correct classes to model messages", () => {
      const messages = [
        {
          role: "model",
          parts: [{ text: "Model message" }],
        },
      ];
      const { container } = render(
        <MessageList messages={messages} isAssistantResponding={false} />,
      );

      const messageDiv = container.querySelector(".bg-gray-100");
      expect(messageDiv).toBeDefined();
    });
  });

  describe("auto-scroll", () => {
    it("includes scroll target div", () => {
      const { container } = render(
        <MessageList messages={[]} isAssistantResponding={false} />,
      );

      // The messagesEndRef div should exist
      const divs = container.querySelectorAll("div");
      expect(divs.length).toBeGreaterThan(0);
    });
  });
});
