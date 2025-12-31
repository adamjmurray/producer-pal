/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import type { UIPart } from "#webui/types/messages";
import { AssistantMessage } from "./AssistantMessage";

describe("AssistantMessage", () => {
  describe("basic rendering", () => {
    it("renders container with correct classes", () => {
      const parts: UIPart[] = [{ type: "text", content: "Test" }];

      render(<AssistantMessage parts={parts} />);
      const container = document.querySelector(".flex.flex-col.gap-3.py-2");

      expect(container).toBeDefined();
    });

    it("renders empty container when no parts", () => {
      render(<AssistantMessage parts={[]} />);
      const container = document.querySelector(".flex.flex-col.gap-3.py-2");

      expect(container).toBeDefined();
      expect(container!.children).toHaveLength(0);
    });
  });

  describe("text parts", () => {
    it("renders text part using AssistantText", () => {
      const parts: UIPart[] = [{ type: "text", content: "Hello world" }];

      render(<AssistantMessage parts={parts} />);
      const prose = document.querySelector(".prose");

      expect(prose).toBeDefined();
      expect(prose!.innerHTML).toContain("Hello world");
    });

    it("renders multiple text parts", () => {
      const parts: UIPart[] = [
        { type: "text", content: "First" },
        { type: "text", content: "Second" },
      ];

      render(<AssistantMessage parts={parts} />);
      const proseElements = document.querySelectorAll(".prose");

      expect(proseElements).toHaveLength(2);
    });
  });

  describe("thought parts", () => {
    it("renders thought part using AssistantThought", () => {
      const parts: UIPart[] = [{ type: "thought", content: "Thinking..." }];

      render(<AssistantMessage parts={parts} />);
      const details = document.querySelector("details");

      expect(details).toBeDefined();
    });

    it("passes isOpen prop to AssistantThought", () => {
      const parts: UIPart[] = [
        { type: "thought", content: "Thinking...", isOpen: true },
      ];

      render(<AssistantMessage parts={parts} />);
      const details = document.querySelector("details");

      expect(details!.open).toBe(true);
    });

    it("passes isResponding prop to AssistantThought", () => {
      const parts: UIPart[] = [
        { type: "thought", content: "Thinking...", isOpen: true },
      ];

      render(<AssistantMessage parts={parts} isResponding={true} />);
      const details = document.querySelector("details");

      expect(details!.className).toContain("animate-pulse");
    });

    it("does not pass isResponding when false", () => {
      const parts: UIPart[] = [
        { type: "thought", content: "Thinking...", isOpen: true },
      ];

      render(<AssistantMessage parts={parts} isResponding={false} />);
      const details = document.querySelector("details");

      expect(details!.className).not.toContain("animate-pulse");
    });
  });

  describe("tool parts", () => {
    it("renders tool part using AssistantToolCall", () => {
      const parts: UIPart[] = [
        {
          type: "tool",
          name: "test-tool",
          args: { param: "value" },
          result: "Success",
        },
      ];

      render(<AssistantMessage parts={parts} />);
      const toolCall = document.querySelector("details");

      expect(toolCall).toBeDefined();
    });

    it("passes tool props correctly", () => {
      const parts: UIPart[] = [
        {
          type: "tool",
          name: "test-tool",
          args: { param: "value" },
          result: null,
        },
      ];

      render(<AssistantMessage parts={parts} />);
      const summary = document.querySelector("summary");

      expect(summary!.innerHTML).toContain("test-tool");
    });

    it("handles tool with error", () => {
      const parts: UIPart[] = [
        {
          type: "tool",
          name: "test-tool",
          args: { param: "value" },
          result: "Error occurred",
          isError: true,
        },
      ];

      render(<AssistantMessage parts={parts} />);
      const errorBorder = document.querySelector(".border-red-500");

      expect(errorBorder).toBeDefined();
    });
  });

  describe("error parts", () => {
    it("renders error part using AssistantError", () => {
      const parts: UIPart[] = [
        { type: "error", content: "Something failed", isError: true },
      ];

      render(<AssistantMessage parts={parts} />);
      const errorContainer = document.querySelector(".bg-red-100");

      expect(errorContainer).toBeDefined();
    });

    it("displays error content", () => {
      const parts: UIPart[] = [
        { type: "error", content: "Error message", isError: true },
      ];

      render(<AssistantMessage parts={parts} />);
      const errorContent = document.querySelector(".whitespace-pre-wrap");

      expect(errorContent!.textContent).toBe("Error message");
    });
  });

  describe("multiple parts", () => {
    it("renders multiple different part types in order", () => {
      const parts: UIPart[] = [
        { type: "text", content: "First text" },
        { type: "thought", content: "Thinking..." },
        {
          type: "tool",
          name: "test-tool",
          args: {},
          result: "Success",
        },
        { type: "text", content: "Second text" },
        { type: "error", content: "Error", isError: true },
      ];

      render(<AssistantMessage parts={parts} />);

      const container = document.querySelector(".flex.flex-col.gap-3.py-2");

      expect(container!.children).toHaveLength(5);

      // Verify order by checking child elements
      // First child is AssistantText
      const child0 = container!.children[0] as HTMLElement;

      expect(child0.className).toContain("prose");
      expect(child0.innerHTML).toContain("First text");

      // Second child is AssistantThought (details element)
      const child1 = container!.children[1] as HTMLDetailsElement;

      expect(child1.tagName).toBe("DETAILS");

      // Third child is AssistantToolCall (details element)
      const child2 = container!.children[2] as HTMLDetailsElement;

      expect(child2.tagName).toBe("DETAILS");

      // Fourth child is AssistantText
      const child3 = container!.children[3] as HTMLElement;

      expect(child3.className).toContain("prose");
      expect(child3.innerHTML).toContain("Second text");

      // Fifth child is AssistantError
      const child4 = container!.children[4] as HTMLElement;

      expect(child4.className).toContain("bg-red-100");
    });

    it("maintains key prop for each part", () => {
      const parts: UIPart[] = [
        { type: "text", content: "Text 1" },
        { type: "text", content: "Text 2" },
        { type: "text", content: "Text 3" },
      ];

      render(<AssistantMessage parts={parts} />);

      const container = document.querySelector(".flex.flex-col.gap-3.py-2");

      expect(container!.children).toHaveLength(3);
    });
  });
});
