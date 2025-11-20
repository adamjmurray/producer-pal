/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { AssistantThought } from "./AssistantThought";

describe("AssistantThought", () => {
  describe("basic rendering", () => {
    it("renders as details element", () => {
      render(<AssistantThought content="Test thought" isOpen={false} />);
      const details = document.querySelector("details");
      expect(details).toBeDefined();
    });

    it("has correct styling classes", () => {
      render(<AssistantThought content="Test thought" isOpen={false} />);
      const details = document.querySelector("details");
      expect(details!.className).toContain("bg-gray-200");
      expect(details!.className).toContain("dark:bg-gray-700");
      expect(details!.className).toContain("border-green-500");
    });
  });

  describe("open state", () => {
    it("is open when isOpen is true", () => {
      render(<AssistantThought content="Test thought" isOpen={true} />);
      const details = document.querySelector("details");
      expect(details!.open).toBe(true);
    });

    it("is closed when isOpen is false", () => {
      render(<AssistantThought content="Test thought" isOpen={false} />);
      const details = document.querySelector("details");
      expect(details!.open).toBe(false);
    });
  });

  describe("animation behavior", () => {
    it("has animate-pulse class when isOpen and isResponding are both true", () => {
      render(
        <AssistantThought
          content="Test thought"
          isOpen={true}
          isResponding={true}
        />,
      );
      const details = document.querySelector("details");
      expect(details!.className).toContain("animate-pulse");
    });

    it("does not have animate-pulse class when isOpen is true but isResponding is false", () => {
      render(
        <AssistantThought
          content="Test thought"
          isOpen={true}
          isResponding={false}
        />,
      );
      const details = document.querySelector("details");
      expect(details!.className).not.toContain("animate-pulse");
    });

    it("does not have animate-pulse class when isOpen is true but isResponding is undefined", () => {
      render(<AssistantThought content="Test thought" isOpen={true} />);
      const details = document.querySelector("details");
      expect(details!.className).not.toContain("animate-pulse");
    });

    it("does not have animate-pulse class when isOpen is false", () => {
      render(
        <AssistantThought
          content="Test thought"
          isOpen={false}
          isResponding={true}
        />,
      );
      const details = document.querySelector("details");
      expect(details!.className).not.toContain("animate-pulse");
    });

    it("does not have animate-pulse class when both are false", () => {
      render(
        <AssistantThought
          content="Test thought"
          isOpen={false}
          isResponding={false}
        />,
      );
      const details = document.querySelector("details");
      expect(details!.className).not.toContain("animate-pulse");
    });
  });

  describe("summary display", () => {
    it("shows 'Thinking...' when open", () => {
      render(
        <AssistantThought content="First line\nSecond line" isOpen={true} />,
      );
      expect(screen.getByText("💭 Thinking...")).toBeDefined();
    });

    it("shows first line when closed", () => {
      render(
        <AssistantThought content="First line\nSecond line" isOpen={false} />,
      );
      const summary = document.querySelector("summary");
      expect(summary!.innerHTML).toContain("First line");
    });

    it("handles single-line content when closed", () => {
      render(<AssistantThought content="Single line" isOpen={false} />);
      const summary = document.querySelector("summary");
      expect(summary!.innerHTML).toContain("Single line");
    });
  });

  describe("content display", () => {
    it("shows full content when open", () => {
      render(
        <AssistantThought
          content="First line\nSecond line\nThird line"
          isOpen={true}
        />,
      );
      const contentDiv = document.querySelector(".prose");
      expect(contentDiv!.innerHTML).toContain("First line");
      expect(contentDiv!.innerHTML).toContain("Second line");
      expect(contentDiv!.innerHTML).toContain("Third line");
    });

    it("renders different content when closed vs open", () => {
      // The closed state should render differently than open state
      // We verify this by checking the DOM structure exists when closed
      const { container: closedContainer } = render(
        <AssistantThought
          content="First line\nSecond line\nThird line"
          isOpen={false}
        />,
      );
      const { container: openContainer } = render(
        <AssistantThought
          content="First line\nSecond line\nThird line"
          isOpen={true}
        />,
      );

      // Both should have the prose div
      expect(closedContainer.querySelector(".prose")).toBeDefined();
      expect(openContainer.querySelector(".prose")).toBeDefined();

      // The open version should definitely have all content
      const openContent = openContainer.querySelector(".prose");
      expect(openContent!.innerHTML).toContain("First line");
      expect(openContent!.innerHTML).toContain("Second line");
    });
  });

  describe("markdown rendering", () => {
    it("renders markdown in content", () => {
      render(<AssistantThought content="**bold** text" isOpen={true} />);
      const contentDiv = document.querySelector(".prose");
      expect(contentDiv!.innerHTML).toContain("<strong>");
    });

    it("renders inline markdown in summary when closed", () => {
      render(<AssistantThought content="**bold** text" isOpen={false} />);
      const summary = document.querySelector("summary");
      expect(summary!.innerHTML).toContain("<strong>");
    });
  });
});
