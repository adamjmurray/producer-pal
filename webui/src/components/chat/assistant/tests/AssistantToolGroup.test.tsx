// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { type UIStepUsagePart, type UIToolPart } from "#webui/types/messages";
import { AssistantToolGroup } from "#webui/components/chat/assistant/AssistantToolGroup";

const TEST_TOOL_NAMES: Record<string, string> = {
  "ppal-create-track": "Create Track",
  "ppal-update-track": "Update Track",
  "ppal-read-track": "Read Track",
};

const tool = (
  name: string,
  result: string | null = "ok",
  isError?: boolean,
): UIToolPart => ({
  type: "tool",
  name,
  args: { arg: "val" },
  result,
  isError,
});

/**
 * Renders component wrapped in ToolNamesContext provider
 * @param ui - Component to render
 * @returns Render result
 */
function renderWithToolNames(ui: preact.JSX.Element) {
  return render(
    <ToolNamesContext.Provider value={TEST_TOOL_NAMES}>
      {ui}
    </ToolNamesContext.Provider>,
  );
}

const defaultParts: (UIToolPart | UIStepUsagePart)[] = [
  tool("ppal-create-track"),
  tool("ppal-create-track"),
  tool("ppal-create-track"),
];

describe("AssistantToolGroup", () => {
  describe("summary text", () => {
    it("shows first tool name and count of other tools", () => {
      renderWithToolNames(
        <AssistantToolGroup parts={defaultParts} indices={[0, 1, 2]} />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("Create Track");
      expect(summary.textContent).toContain("and 2 other tools");
    });

    it("uses singular 'tool' when only 1 other", () => {
      // Though min group is 3, test with 2 tools for singular grammar
      // (Component doesn't enforce minimum — groupToolParts does)
      const parts = [tool("ppal-create-track"), tool("ppal-update-track")];

      renderWithToolNames(
        <AssistantToolGroup parts={parts} indices={[0, 1]} />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("and 1 other tool");
      expect(summary.textContent).not.toContain("tools");
    });

    it("falls back to raw name when not in tool names context", () => {
      render(
        <AssistantToolGroup
          parts={[
            tool("unknown-tool"),
            tool("unknown-tool"),
            tool("unknown-tool"),
          ]}
          indices={[0, 1, 2]}
        />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("unknown-tool");
    });
  });

  describe("pending state", () => {
    it("shows animate-pulse when any tool is pending", () => {
      const parts = [
        tool("ppal-create-track"),
        tool("ppal-create-track", null),
        tool("ppal-create-track"),
      ];

      render(<AssistantToolGroup parts={parts} indices={[0, 1, 2]} />);
      const details = document.querySelector("details")!;

      expect(details.className).toContain("animate-pulse");
    });

    it("does not show animate-pulse when all tools have results", () => {
      render(<AssistantToolGroup parts={defaultParts} indices={[0, 1, 2]} />);
      const details = document.querySelector("details")!;

      expect(details.className).not.toContain("animate-pulse");
    });

    it("shows 'using tools:' prefix when pending", () => {
      const parts = [
        tool("ppal-create-track", null),
        tool("ppal-create-track", null),
        tool("ppal-create-track", null),
      ];

      renderWithToolNames(
        <AssistantToolGroup parts={parts} indices={[0, 1, 2]} />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("using tools:");
    });
  });

  describe("error state", () => {
    it("shows red border when any tool has error", () => {
      const parts = [
        tool("ppal-create-track"),
        tool("ppal-create-track", "Error", true),
        tool("ppal-create-track"),
      ];

      render(<AssistantToolGroup parts={parts} indices={[0, 1, 2]} />);
      const details = document.querySelector("details")!;

      expect(details.className).toContain("border-red-500");
    });

    it("shows error count in summary", () => {
      const parts = [
        tool("ppal-create-track", "Error", true),
        tool("ppal-create-track", "Error", true),
        tool("ppal-create-track"),
      ];

      renderWithToolNames(
        <AssistantToolGroup parts={parts} indices={[0, 1, 2]} />,
      );
      const summary = document.querySelector("summary")!;

      expect(summary.textContent).toContain("2 failed");
    });

    it("does not show red border when no errors", () => {
      render(<AssistantToolGroup parts={defaultParts} indices={[0, 1, 2]} />);
      const details = document.querySelector("details")!;

      expect(details.className).not.toContain("border-red-500");
    });
  });

  describe("expanded content", () => {
    it("renders individual AssistantToolCall components inside", () => {
      render(<AssistantToolGroup parts={defaultParts} indices={[0, 1, 2]} />);

      // Outer group + 3 inner tool calls + 3 result disclosures
      const allDetails = document.querySelectorAll("details");

      expect(allDetails).toHaveLength(7);
    });

    it("skips step-usage parts in rendered content", () => {
      const parts: (UIToolPart | UIStepUsagePart)[] = [
        tool("ppal-create-track"),
        { type: "step-usage", usage: { inputTokens: 100, outputTokens: 50 } },
        tool("ppal-create-track"),
        tool("ppal-create-track"),
      ];

      const { container } = render(
        <AssistantToolGroup parts={parts} indices={[0, 1, 2, 3]} />,
      );

      // Step-usage rendered by parent, not by this component
      expect(container.textContent).not.toContain("tokens:");

      // Still renders 3 tool calls (+ 3 result disclosures + 1 group)
      const allDetails = document.querySelectorAll("details");

      expect(allDetails).toHaveLength(7);
    });
  });
});
