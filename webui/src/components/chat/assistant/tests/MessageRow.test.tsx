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
