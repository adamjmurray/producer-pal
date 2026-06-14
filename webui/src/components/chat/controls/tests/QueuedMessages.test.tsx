// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { QueuedMessages } from "#webui/components/chat/controls/QueuedMessages";

describe("QueuedMessages", () => {
  const scrollRef = { current: { scrollIntoView: vi.fn() } };
  const onRemove = vi.fn();

  it("renders nothing when queue is empty", () => {
    const { container } = render(
      <QueuedMessages
        queuedMessages={[]}
        onRemove={onRemove}
        scrollRef={scrollRef as never}
      />,
    );

    expect(container.textContent).toBe("");
  });

  it("renders queued messages with text and label", () => {
    const messages = [
      { id: 0, text: "Follow up" },
      { id: 1, text: "Another" },
    ];

    render(
      <QueuedMessages
        queuedMessages={messages}
        onRemove={onRemove}
        scrollRef={scrollRef as never}
      />,
    );

    expect(screen.getByText("Follow up")).toBeDefined();
    expect(screen.getByText("Another")).toBeDefined();
    expect(screen.getAllByText("queued")).toHaveLength(2);
  });

  it("scrolls into view when messages are queued", () => {
    const ref = { current: { scrollIntoView: vi.fn() } };

    render(
      <QueuedMessages
        queuedMessages={[{ id: 0, text: "hi" }]}
        onRemove={onRemove}
        scrollRef={ref as never}
      />,
    );

    expect(ref.current.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
    });
  });

  it("does not scroll again when a queued message is removed", () => {
    const ref = { current: { scrollIntoView: vi.fn() } };
    const { rerender } = render(
      <QueuedMessages
        queuedMessages={[
          { id: 0, text: "First" },
          { id: 1, text: "Second" },
        ]}
        onRemove={onRemove}
        scrollRef={ref as never}
      />,
    );

    // Initial mount with a non-empty queue scrolls once (a message arrived).
    expect(ref.current.scrollIntoView).toHaveBeenCalledTimes(1);

    // Removing one (length 2 -> 1) must not yank the view back to the bottom.
    rerender(
      <QueuedMessages
        queuedMessages={[{ id: 0, text: "First" }]}
        onRemove={onRemove}
        scrollRef={ref as never}
      />,
    );

    expect(ref.current.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("renders a remove button for each queued message", () => {
    const messages = [
      { id: 0, text: "First" },
      { id: 1, text: "Second" },
      { id: 2, text: "Third" },
    ];

    render(
      <QueuedMessages
        queuedMessages={messages}
        onRemove={onRemove}
        scrollRef={scrollRef as never}
      />,
    );

    const buttons = screen.getAllByRole("button", {
      name: "Remove queued message",
    });

    expect(buttons).toHaveLength(3);
  });

  it("calls onRemove with message id when X button is clicked", () => {
    const remove = vi.fn();
    const messages = [
      { id: 5, text: "First" },
      { id: 8, text: "Second" },
    ];

    render(
      <QueuedMessages
        queuedMessages={messages}
        onRemove={remove}
        scrollRef={scrollRef as never}
      />,
    );

    const buttons = screen.getAllByRole("button", {
      name: "Remove queued message",
    });

    fireEvent.click(buttons[0] as HTMLElement);

    expect(remove).toHaveBeenCalledExactlyOnceWith(5);
  });
});
