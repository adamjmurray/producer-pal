// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type TokenUsage } from "#webui/chat/sdk/types";
import { type UIMessage } from "#webui/types/messages";
import { MessageRow } from "#webui/components/chat/assistant/MessageRow";

/**
 * Render a single assistant MessageRow whose usage drives the TokenUsageLabel.
 * @param usage - Token usage for the assistant message
 * @returns The rendered container
 */
function renderAssistant(usage: TokenUsage) {
  const message: UIMessage = {
    role: "model",
    parts: [{ type: "text", content: "hi" }],
    rawHistoryIndex: 0,
    timestamp: 0,
    usage,
  };

  return render(
    <MessageRow
      message={message}
      originalIdx={0}
      messages={[message]}
      isAssistantResponding={false}
      showTimestamps={false}
      showTokenUsage={true}
      handleRetry={vi.fn()}
      handleEdit={vi.fn()}
      editingIndex={null}
      setEditingIndex={vi.fn()}
      editText=""
      setEditText={vi.fn()}
    />,
  );
}

/**
 * Render a user MessageRow, optionally in edit mode.
 * @param parts - The user message's UI parts
 * @param editingIndex - Index being edited, or null
 * @returns The rendered container
 */
function renderUser(parts: UIMessage["parts"], editingIndex: number | null) {
  const message: UIMessage = {
    role: "user",
    parts,
    rawHistoryIndex: 0,
    timestamp: 0,
  };

  return render(
    <MessageRow
      message={message}
      originalIdx={0}
      messages={[message]}
      isAssistantResponding={false}
      showTimestamps={false}
      showTokenUsage={false}
      handleRetry={vi.fn()}
      handleEdit={vi.fn()}
      editingIndex={editingIndex}
      setEditingIndex={vi.fn()}
      editText="match this"
      setEditText={vi.fn()}
    />,
  );
}

describe("MessageRow user images", () => {
  const parts: UIMessage["parts"] = [
    { type: "image", mediaType: "image/png", data: "AAA" },
    { type: "text", content: "match this" },
  ];

  it.each([
    { name: "reading", editingIndex: null },
    { name: "editing", editingIndex: 0 },
  ])("shows attached images while $name", ({ editingIndex }) => {
    const { container } = renderUser(parts, editingIndex);
    const image = container.querySelector("img");

    expect(image?.getAttribute("src")).toBe("data:image/png;base64,AAA");
  });

  it("renders the text without the image parts", () => {
    const { container } = renderUser(parts, null);

    expect(container.textContent).toContain("match this");
  });
});

describe("MessageRow token usage label", () => {
  it("renders cached and reasoning segments and defaults absent input/output to 0", () => {
    // inputTokens/outputTokens absent → `?? 0` nullish branches; cacheRead and
    // reasoning present (> 0) → their conditional segments render.
    const { container } = renderAssistant({
      cacheReadTokens: 9000,
      reasoningTokens: 225,
    });

    expect(container.textContent).toContain("tokens: 0");
    expect(container.textContent).toContain("9K cached");
    expect(container.textContent).toContain("225 reasoning");
    // outputTokens absent → "→ 0"
    expect(container.textContent).toContain("→ 0");
  });
});
