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
      { id: 0, text: "Follow up", timestamp: 1000 },
      { id: 1, text: "Another", timestamp: 2000 },
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
        queuedMessages={[{ id: 0, text: "hi", timestamp: 1 }]}
        onRemove={onRemove}
        scrollRef={ref as never}
      />,
    );

    expect(ref.current.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
    });
  });

  it("renders a remove button for each queued message", () => {
    const messages = [
      { id: 0, text: "First", timestamp: 1000 },
      { id: 1, text: "Second", timestamp: 2000 },
      { id: 2, text: "Third", timestamp: 3000 },
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
      { id: 5, text: "First", timestamp: 1000 },
      { id: 8, text: "Second", timestamp: 2000 },
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
