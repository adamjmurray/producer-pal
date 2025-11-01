/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AssistantToolCall } from "./AssistantToolCall.jsx";

// Mock the config module
vi.mock("../../../config.js", () => ({
  toolNames: {
    "ppal-read-live-set": "Read Live Set",
    "test-tool": "Test Tool",
  },
}));

describe("AssistantToolCall", () => {
  const defaultProps = {
    name: "test-tool",
    args: { arg1: "value1" },
    result: null,
    isError: false,
  };

  describe("basic rendering", () => {
    it("renders as details element", () => {
      render(<AssistantToolCall {...defaultProps} />);
      const details = document.querySelector("details");
      expect(details).toBeDefined();
    });

    it("has correct base styling classes", () => {
      render(<AssistantToolCall {...defaultProps} />);
      const details = document.querySelector("details");
      expect(details!.className).toContain("bg-gray-200");
      expect(details!.className).toContain("dark:bg-gray-900");
      expect(details!.className).toContain("font-mono");
    });
  });

  describe("tool name display", () => {
    it("shows friendly name from toolNames config", () => {
      render(<AssistantToolCall {...defaultProps} name="test-tool" />);
      const summary = document.querySelector("summary");
      expect(summary!.textContent).toContain("Test Tool");
    });

    it("shows raw name when not in toolNames config", () => {
      render(<AssistantToolCall {...defaultProps} name="unknown-tool" />);
      const summary = document.querySelector("summary");
      expect(summary!.textContent).toContain("unknown-tool");
    });

    it("includes tool emoji in summary", () => {
      render(<AssistantToolCall {...defaultProps} />);
      const summary = document.querySelector("summary");
      expect(summary!.textContent).toContain("🔧");
    });
  });

  describe("tool state display", () => {
    it("shows 'using tool:' when no result yet", () => {
      render(<AssistantToolCall {...defaultProps} result={null} />);
      expect(screen.getByText(/using tool:/)).toBeDefined();
    });

    it("shows 'used tool:' when has result and not error", () => {
      render(<AssistantToolCall {...defaultProps} result="Success" />);
      expect(screen.getByText(/used tool:/)).toBeDefined();
    });

    it("shows 'tool failed:' when has result and is error", () => {
      render(
        <AssistantToolCall {...defaultProps} result="Error" isError={true} />,
      );
      expect(screen.getByText(/tool failed:/)).toBeDefined();
    });
  });

  describe("animate-pulse state", () => {
    it("has animate-pulse class when no result", () => {
      render(<AssistantToolCall {...defaultProps} result={null} />);
      const details = document.querySelector("details");
      expect(details!.className).toContain("animate-pulse");
    });

    it("does not have animate-pulse class when has result", () => {
      render(<AssistantToolCall {...defaultProps} result="Done" />);
      const details = document.querySelector("details");
      expect(details!.className).not.toContain("animate-pulse");
    });
  });

  describe("error styling", () => {
    it("has red border when isError is true", () => {
      render(
        <AssistantToolCall {...defaultProps} result="Error" isError={true} />,
      );
      const details = document.querySelector("details");
      expect(details!.className).toContain("border-red-500");
    });

    it("does not have red border when isError is false", () => {
      render(<AssistantToolCall {...defaultProps} result="Success" />);
      const details = document.querySelector("details");
      expect(details!.className).not.toContain("border-red-500");
    });
  });

  describe("function call display", () => {
    it("shows function name and args", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          name="test-tool"
          args={{ foo: "bar", num: 42 }}
        />,
      );
      const funcDiv = document.querySelector(".text-gray-500");
      expect(funcDiv!.textContent).toContain("test-tool");
      expect(funcDiv!.textContent).toContain("foo");
      expect(funcDiv!.textContent).toContain("bar");
    });

    it("formats args as JSON", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          name="test-tool"
          args={{ key: "value" }}
        />,
      );
      const funcDiv = document.querySelector(".text-gray-500");
      expect(funcDiv!.textContent).toContain('"key":"value"');
    });
  });

  describe("result display", () => {
    it("does not show result details when result is null", () => {
      render(<AssistantToolCall {...defaultProps} result={null} />);
      const nestedDetails = document.querySelectorAll("details");
      expect(nestedDetails.length).toBe(1); // Only outer details
    });

    it("shows result details when result exists", () => {
      render(<AssistantToolCall {...defaultProps} result="Result text" />);
      const nestedDetails = document.querySelectorAll("details");
      expect(nestedDetails.length).toBe(2); // Outer and inner details
    });

    it("shows result preview in summary", () => {
      render(<AssistantToolCall {...defaultProps} result="Result preview" />);
      const summaries = document.querySelectorAll("summary");
      const resultSummary = summaries[1]; // Second summary is for the result
      expect(resultSummary.textContent).toContain("Result preview");
    });
  });

  describe("FullResultDetails rendering", () => {
    it("renders JSON result with pretty-printing", () => {
      const jsonResult = '{"status":"ok","count":42}';
      render(<AssistantToolCall {...defaultProps} result={jsonResult} />);
      const pre = document.querySelector("pre");
      expect(pre).toBeDefined();
      expect(pre!.innerHTML).toContain('"status"');
      expect(pre!.innerHTML).toContain('"ok"');
      expect(pre!.innerHTML).toContain('"count"');
    });

    it("handles newlines in JSON strings", () => {
      const jsonResult = '{"text":"line1\\nline2"}';
      render(<AssistantToolCall {...defaultProps} result={jsonResult} />);
      const pre = document.querySelector("pre");
      expect(pre).toBeDefined();
      // The \n should be replaced with actual newline
      expect(pre!.innerHTML).toContain("line1\nline2");
    });

    it("renders non-JSON result as plain text", () => {
      render(
        <AssistantToolCall {...defaultProps} result="Plain text result" />,
      );
      // When not JSON, it should render without <pre>
      const allText = document.body.textContent;
      expect(allText).toContain("Plain text result");
    });

    it("handles malformed JSON gracefully", () => {
      render(<AssistantToolCall {...defaultProps} result="{invalid json" />);
      // Should fall back to plain text rendering
      const allText = document.body.textContent;
      expect(allText).toContain("{invalid json");
    });
  });

  describe("error result styling", () => {
    it("applies red text to error result summary", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="Error message"
          isError={true}
        />,
      );
      const resultSummary = document.querySelectorAll("summary")[1]; // Second summary (inner details)
      expect(resultSummary.className).toContain("text-red-700");
      expect(resultSummary.className).toContain("dark:text-red-400");
    });

    it("applies gray text to success result summary", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="Success message"
          isError={false}
        />,
      );
      const resultSummary = document.querySelectorAll("summary")[1]; // Second summary (inner details)
      expect(resultSummary.className).toContain("text-gray-600");
      expect(resultSummary.className).toContain("dark:text-gray-400");
    });
  });
});
