// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { AssistantToolCall } from "./AssistantToolCall";

const TEST_TOOL_NAMES: Record<string, string> = {
  "ppal-read-live-set": "Read Live Set",
  "test-tool": "Test Tool",
};

/**
 * Renders component wrapped in ToolNamesContext provider
 * @param {preact.JSX.Element} ui - Component to render
 * @returns {import("@testing-library/preact").RenderResult} Render result
 */
function renderWithToolNames(ui: preact.JSX.Element) {
  return render(
    <ToolNamesContext.Provider value={TEST_TOOL_NAMES}>
      {ui}
    </ToolNamesContext.Provider>,
  );
}

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
    it("shows friendly name from toolNames context", () => {
      renderWithToolNames(
        <AssistantToolCall {...defaultProps} name="test-tool" />,
      );
      const summary = document.querySelector("summary");

      expect(summary!.textContent).toContain("Test Tool");
    });

    it("shows raw name when not in toolNames context", () => {
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

    it("does not auto-expand errors", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="Error message"
          isError={true}
        />,
      );
      const details = document.querySelector("details")!;

      expect(details.hasAttribute("open")).toBe(false);
    });

    it("applies red text to error spans inside summary", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="Error message"
          isError={true}
        />,
      );
      const summary = document.querySelector("summary")!;
      const redSpans = summary.querySelectorAll(".text-red-700");

      expect(redSpans.length).toBeGreaterThanOrEqual(1);
    });

    it("does not apply red text to summary element itself", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="Error message"
          isError={true}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.className).not.toContain("text-red-700");
    });
  });

  describe("error summary fallback", () => {
    it("shows fallback 'error' text when extractErrorSummary returns null", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="some unknown error format"
          isError={true}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("— error");
    });
  });

  describe("error summary in summary line", () => {
    it("shows clean error in summary for tool error prefix", () => {
      const result = JSON.stringify(
        "Error executing tool 'test-tool': something broke",
      );

      render(
        <AssistantToolCall {...defaultProps} result={result} isError={true} />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("something broke");
    });

    it("shows clean error in summary for MCP content array with error", () => {
      const result = JSON.stringify([
        {
          type: "text",
          text: JSON.stringify({ error: "No clip in this slot" }),
        },
      ]);

      render(
        <AssistantToolCall
          {...defaultProps}
          result={result}
          isError={undefined}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("No clip in this slot");
    });
  });

  describe("error expanded view", () => {
    it("shows raw result in disclosure like success results", () => {
      const result = JSON.stringify(
        "Error executing tool 'test-tool': something broke",
      );

      render(
        <AssistantToolCall {...defaultProps} result={result} isError={true} />,
      );
      const allDetails = document.querySelectorAll("details");

      expect(allDetails).toHaveLength(2); // Outer + result disclosure
      const resultSummary = document.querySelectorAll("summary")[1]!;

      expect(resultSummary.className).toContain("text-gray-600");
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

      expect(nestedDetails).toHaveLength(1); // Only outer details
    });

    it("shows result details when result exists", () => {
      render(<AssistantToolCall {...defaultProps} result="Result text" />);
      const nestedDetails = document.querySelectorAll("details");

      expect(nestedDetails).toHaveLength(2); // Outer and inner details
    });

    it("shows result preview in summary", () => {
      render(<AssistantToolCall {...defaultProps} result="Result preview" />);
      const summaries = document.querySelectorAll("summary");
      const resultSummary = summaries[1]!; // Second summary is for the result

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

    it("formats JSON array results", () => {
      const arrayResult = '[{"type":"text","text":"hello"}]';

      render(<AssistantToolCall {...defaultProps} result={arrayResult} />);
      const pre = document.querySelector("pre");

      expect(pre).toBeDefined();
      expect(pre!.innerHTML).toContain('"type"');
    });

    it("unwraps JSON-stringified string results", () => {
      const stringResult = JSON.stringify("inner string content");

      render(
        <AssistantToolCall
          {...defaultProps}
          result={stringResult}
          isError={true}
        />,
      );
      const allText = document.body.textContent;

      expect(allText).toContain("inner string content");
    });
  });

  describe("heuristic error detection", () => {
    it("detects soft error via 'error' key in result JSON when isError unset", () => {
      const softErrorResult = JSON.stringify({
        error: "No clip in this slot",
        id: null,
        type: null,
        trackIndex: 0,
        sceneIndex: 5,
      });

      render(
        <AssistantToolCall
          {...defaultProps}
          result={softErrorResult}
          isError={undefined}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).toContain("border-red-500");
      expect(screen.getByText(/tool failed:/)).toBeDefined();
    });

    it("does not false-positive on normal results without error key", () => {
      const normalResult = JSON.stringify({ id: "1", name: "Track" });

      render(
        <AssistantToolCall
          {...defaultProps}
          result={normalResult}
          isError={undefined}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).not.toContain("border-red-500");
      expect(screen.getByText(/used tool:/)).toBeDefined();
    });
  });

  describe("warning styling", () => {
    /**
     * Build MCP content array result with warnings
     * @param data - Tool result object
     * @param warnings - Warning strings
     * @returns Serialized result
     */
    function warningResult(data: object, ...warnings: string[]): string {
      return JSON.stringify([
        { type: "text", text: JSON.stringify(data) },
        ...warnings.map((w) => ({ type: "text", text: w })),
      ]);
    }

    it("has yellow border when result contains warnings", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result={warningResult({ id: "44" }, "WARNING: something skipped")}
          isError={false}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).toContain("border-yellow-500");
    });

    it("does not have yellow border for normal success", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result={warningResult({ id: "44" })}
          isError={false}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).not.toContain("border-yellow-500");
    });

    it("shows warning prefix and first warning text in summary", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result={warningResult({ id: "44" }, "WARNING: quantize skipped")}
          isError={false}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("warning: quantize skipped");
    });

    it("shows other warning count for multiple warnings", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result={warningResult(
            { id: "44" },
            "WARNING: first warning",
            "WARNING: second warning",
          )}
          isError={false}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("first warning");
      expect(summary.textContent).toContain("+ 1 other warning");
    });

    it("pluralizes other warnings count", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result={warningResult(
            { id: "44" },
            "WARNING: first",
            "WARNING: second",
            "WARNING: third",
          )}
          isError={false}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("+ 2 other warnings");
    });

    it("does not show warning styling when isError is true", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result={warningResult({ id: "44" }, "WARNING: something skipped")}
          isError={true}
        />,
      );
      const details = document.querySelector("details");

      expect(details!.className).not.toContain("border-yellow-500");
      expect(details!.className).toContain("border-red-500");
    });
  });

  describe("success result styling", () => {
    it("applies gray text to success result summary", () => {
      render(
        <AssistantToolCall
          {...defaultProps}
          result="Success message"
          isError={false}
        />,
      );
      const resultSummary = document.querySelectorAll("summary")[1]!; // Second summary (inner details)

      expect(resultSummary.className).toContain("text-gray-600");
      expect(resultSummary.className).toContain("dark:text-gray-400");
    });
  });
});
