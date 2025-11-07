/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { AssistantError } from "./AssistantError.jsx";

describe("AssistantError", () => {
  describe("basic rendering", () => {
    it("renders error container with correct styling", () => {
      render(<AssistantError content="Test error" />);
      const container = document.querySelector(".bg-red-100");
      expect(container).toBeDefined();
    });

    it("has error styling classes", () => {
      render(<AssistantError content="Test error" />);
      const container = document.querySelector(".bg-red-100");
      expect(container!.className).toContain("bg-red-100");
      expect(container!.className).toContain("dark:bg-red-900");
      expect(container!.className).toContain("text-red-900");
      expect(container!.className).toContain("dark:text-red-100");
      expect(container!.className).toContain("border-l-4");
      expect(container!.className).toContain("border-red-600");
    });
  });

  describe("content display", () => {
    it("displays 'Error' heading", () => {
      render(<AssistantError content="Test error" />);
      const heading = document.querySelector(".font-semibold");
      expect(heading).toBeDefined();
      expect(heading!.textContent).toBe("Error");
    });

    it("displays error content", () => {
      render(<AssistantError content="Something went wrong" />);
      const content = document.querySelector(".whitespace-pre-wrap");
      expect(content).toBeDefined();
      expect(content!.textContent).toBe("Something went wrong");
    });

    it("preserves whitespace in error content", () => {
      const multilineContent = "Line 1\nLine 2";
      render(<AssistantError content={multilineContent} />);
      const content = document.querySelector(".whitespace-pre-wrap");
      expect(content!.className).toContain("whitespace-pre-wrap");
      expect(content!.textContent).toBe(multilineContent);
    });

    it("renders long error messages", () => {
      const longError =
        "This is a very long error message that contains multiple words";
      render(<AssistantError content={longError} />);
      const content = document.querySelector(".whitespace-pre-wrap");
      expect(content!.textContent).toBe(longError);
    });
  });
});
