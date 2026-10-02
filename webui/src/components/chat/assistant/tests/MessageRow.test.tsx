// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type StepTiming, type TokenUsage } from "#webui/chat/sdk/types";
import { type UIMessage } from "#webui/types/messages";
import { MessageRow } from "#webui/components/chat/assistant/MessageRow";

/**
 * Render a single assistant MessageRow whose usage drives the TokenUsageLabel.
 * @param usage - Token usage for the assistant message
 * @param timing - Generation speed for the message's last step
 * @returns The rendered container
 */
function renderAssistant(usage: TokenUsage, timing?: StepTiming) {
  const message: UIMessage = {
    role: "model",
    parts: [{ type: "text", content: "hi" }],
    rawHistoryIndex: 0,
    timestamp: 0,
    usage,
    timing,
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
 * @param handleEdit - Edit callback
 * @param editText - Text in the edit box
 * @returns The rendered container
 */
function renderUser(
  parts: UIMessage["parts"],
  editingIndex: number | null,
  handleEdit = vi.fn(),
  editText = "match this",
) {
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
      handleEdit={handleEdit}
      editingIndex={editingIndex}
      setEditingIndex={vi.fn()}
      editText={editText}
      setEditText={vi.fn()}
    />,
  );
}

/**
 * The data URLs of the images a render shows.
 * @param container - Rendered container
 * @returns Each image's src
 */
function imageSources(container: Element): Array<string | null> {
  return [...container.querySelectorAll("img")].map((img) =>
    img.getAttribute("src"),
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

  it("offers no remove control while reading", () => {
    renderUser(parts, null);

    expect(screen.queryByLabelText("Remove attachment 1")).toBeNull();
  });

  describe("removing images while editing", () => {
    const twoImages: UIMessage["parts"] = [
      { type: "image", mediaType: "image/png", data: "AAA" },
      { type: "image", mediaType: "image/png", data: "BBB" },
      { type: "text", content: "match this" },
    ];

    it("sends without the removed image", () => {
      const handleEdit = vi.fn();
      const { container } = renderUser(twoImages, 0, handleEdit);

      fireEvent.click(screen.getByLabelText("Remove attachment 1"));

      expect(imageSources(container)).toStrictEqual([
        "data:image/png;base64,BBB",
      ]);

      fireEvent.click(screen.getByTestId("edit-message-save"));

      expect(handleEdit).toHaveBeenCalledExactlyOnceWith(0, "match this", [0]);
    });

    it("sends without any image once all are removed", () => {
      const handleEdit = vi.fn();
      const { container } = renderUser(twoImages, 0, handleEdit);

      fireEvent.click(screen.getByLabelText("Remove attachment 1"));
      fireEvent.click(screen.getByLabelText("Remove attachment 1"));

      expect(imageSources(container)).toStrictEqual([]);

      fireEvent.click(screen.getByTestId("edit-message-save"));

      expect(handleEdit).toHaveBeenCalledExactlyOnceWith(
        0,
        "match this",
        [0, 1],
      );
    });

    it("can send an image-only message with one image fewer", () => {
      const handleEdit = vi.fn();

      renderUser(twoImages.slice(0, 2), 0, handleEdit, "");
      fireEvent.click(screen.getByLabelText("Remove attachment 2"));
      fireEvent.click(screen.getByTestId("edit-message-save"));

      expect(handleEdit).toHaveBeenCalledExactlyOnceWith(0, "", [1]);
    });
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
    expect(container.textContent).not.toContain("tok/s");
  });

  it("appends generation speed when the message was timed", () => {
    const { container } = renderAssistant(
      { inputTokens: 12632, outputTokens: 845 },
      { timeToFirstTokenMs: 1240, outputTokensPerSecond: 42.4 },
    );

    expect(container.textContent).toContain("· 42 tok/s · 1.2s to first token");
  });
});

describe("MessageRow retry target", () => {
  it("skips back over earlier assistant turns to the last user message", () => {
    const user: UIMessage = {
      role: "user",
      parts: [{ type: "text", content: "make a beat" }],
      rawHistoryIndex: 0,
      timestamp: 0,
    };
    const assistant = (index: number): UIMessage => ({
      role: "model",
      parts: [{ type: "text", content: `step ${index}` }],
      rawHistoryIndex: index,
      timestamp: 0,
    });
    const messages = [user, assistant(1), assistant(2)];
    const handleRetry = vi.fn();

    render(
      <MessageRow
        message={messages[2]!}
        originalIdx={2}
        messages={messages}
        isAssistantResponding={false}
        showTimestamps={false}
        showTokenUsage={false}
        handleRetry={handleRetry}
        handleEdit={vi.fn()}
        editingIndex={null}
        setEditingIndex={vi.fn()}
        editText=""
        setEditText={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Retry from your last message"));

    expect(handleRetry).toHaveBeenCalledWith(0);
  });
});
