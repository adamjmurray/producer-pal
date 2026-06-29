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

type GroupParts = (UIToolPart | UIStepUsagePart)[];

/**
 * Renders a group over indices [0..n) and returns the rendered DOM plus the
 * group's <details>/<summary> elements (the assertion targets shared by most
 * tests). Pass `withToolNames` to wrap in the ToolNamesContext provider.
 * @param parts - Tool/step parts to render
 * @param withToolNames - Whether to wrap in ToolNamesContext
 * @returns Render result plus the group details and summary elements
 */
function renderGroup(parts: GroupParts, withToolNames = false) {
  const indices = parts.map((_, i) => i);
  const ui = <AssistantToolGroup parts={parts} indices={indices} />;
  const result = withToolNames ? renderWithToolNames(ui) : render(ui);

  return {
    ...result,
    details: document.querySelector("details")!,
    summary: document.querySelector("summary")!,
  };
}

const defaultParts: GroupParts = [
  tool("ppal-create-track"),
  tool("ppal-create-track"),
  tool("ppal-create-track"),
];

describe("AssistantToolGroup", () => {
  describe("summary text", () => {
    it("shows first tool name and count of other tools", () => {
      const { summary } = renderGroup(defaultParts, true);

      expect(summary.textContent).toContain("Create Track");
      expect(summary.textContent).toContain("and 2 other tools");
    });

    it("uses singular 'tool' when only 1 other", () => {
      // Though min group is 3, test with 2 tools for singular grammar
      // (Component doesn't enforce minimum — groupToolParts does)
      const { summary } = renderGroup(
        [tool("ppal-create-track"), tool("ppal-update-track")],
        true,
      );

      expect(summary.textContent).toContain("and 1 other tool");
      expect(summary.textContent).not.toContain("tools");
    });

    it("falls back to raw name when not in tool names context", () => {
      const { summary } = renderGroup([
        tool("unknown-tool"),
        tool("unknown-tool"),
        tool("unknown-tool"),
      ]);

      expect(summary.textContent).toContain("unknown-tool");
    });
  });

  describe("pending state", () => {
    it("shows animate-pulse when any tool is pending", () => {
      const { details } = renderGroup([
        tool("ppal-create-track"),
        tool("ppal-create-track", null),
        tool("ppal-create-track"),
      ]);

      expect(details.className).toContain("animate-pulse");
    });

    it("does not show animate-pulse when all tools have results", () => {
      const { details } = renderGroup(defaultParts);

      expect(details.className).not.toContain("animate-pulse");
    });

    it("shows 'using tools:' prefix when pending", () => {
      const { summary } = renderGroup(
        [
          tool("ppal-create-track", null),
          tool("ppal-create-track", null),
          tool("ppal-create-track", null),
        ],
        true,
      );

      expect(summary.textContent).toContain("using tools:");
    });
  });

  describe("error state", () => {
    it("shows red border when any tool has error", () => {
      const { details } = renderGroup([
        tool("ppal-create-track"),
        tool("ppal-create-track", "Error", true),
        tool("ppal-create-track"),
      ]);

      expect(details.className).toContain("border-red-500");
    });

    it("shows error count in summary", () => {
      const { summary } = renderGroup(
        [
          tool("ppal-create-track", "Error", true),
          tool("ppal-create-track", "Error", true),
          tool("ppal-create-track"),
        ],
        true,
      );

      expect(summary.textContent).toContain("2 failed");
    });

    it("does not show red border when no errors", () => {
      const { details } = renderGroup(defaultParts);

      expect(details.className).not.toContain("border-red-500");
    });
  });

  describe("warning state", () => {
    const warn = (text: string): string =>
      JSON.stringify([{ type: "text", text: `WARNING: ${text}` }]);

    it("shows a yellow border and warning count when a grouped tool warns", () => {
      // A warn-and-skip warning in a collapsed (3+) group must be visible
      // without expanding, like AssistantToolCall. Before the fix the group
      // ignored warnings entirely.
      const { details, summary } = renderGroup(
        [
          tool("ppal-create-track"),
          tool("ppal-update-track", warn("quantize ignored for audio clip")),
          tool("ppal-create-track"),
        ],
        true,
      );

      expect(details.className).toContain("border-yellow-500");
      expect(summary.textContent).toContain("1 warning");
    });

    it("does not show a yellow border when there are no warnings", () => {
      const { details } = renderGroup(defaultParts);

      expect(details.className).not.toContain("border-yellow-500");
    });

    it("prioritizes the error affordance over warnings", () => {
      // With both a failure and a warning, the red error border/summary wins
      // (warnings show only when there's no error), matching the single call.
      const { details, summary } = renderGroup(
        [
          tool("ppal-create-track", "Error", true),
          tool("ppal-update-track", warn("skipped invalid scale")),
          tool("ppal-create-track"),
        ],
        true,
      );

      expect(details.className).toContain("border-red-500");
      expect(details.className).not.toContain("border-yellow-500");
      expect(summary.textContent).toContain("1 failed");
      expect(summary.textContent).not.toContain("warning");
    });
  });

  describe("expanded content", () => {
    it("renders individual AssistantToolCall components inside", () => {
      renderGroup(defaultParts);

      // Outer group + 3 inner tool calls + 3 result disclosures
      const allDetails = document.querySelectorAll("details");

      expect(allDetails).toHaveLength(7);
    });

    it("skips step-usage parts in rendered content", () => {
      const { container } = renderGroup([
        tool("ppal-create-track"),
        { type: "step-usage", usage: { inputTokens: 100, outputTokens: 50 } },
        tool("ppal-create-track"),
        tool("ppal-create-track"),
      ]);

      // Step-usage rendered by parent, not by this component
      expect(container.textContent).not.toContain("tokens:");

      // Still renders 3 tool calls (+ 3 result disclosures + 1 group)
      const allDetails = document.querySelectorAll("details");

      expect(allDetails).toHaveLength(7);
    });
  });
});
