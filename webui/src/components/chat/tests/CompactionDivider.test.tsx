// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("#webui/components/chat/assistant/message-list-helpers"),
  () => ({
    SafeMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
    RenderErrorFallback: () => <div />,
  }),
);

import { CompactionDivider } from "#webui/components/chat/assistant/CompactionDivider";

describe("CompactionDivider", () => {
  it("toggles the summary visibility", () => {
    render(
      <CompactionDivider
        messageIndex={0}
        summary="my summary"
        canUndo={false}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByText("my summary")).toBeNull();
    fireEvent.click(screen.getByText("view summary"));
    expect(screen.getByText("my summary")).toBeTruthy();
    fireEvent.click(screen.getByText("hide summary"));
    expect(screen.queryByText("my summary")).toBeNull();
  });

  it("tags the divider with its message index so scroll-to-fork can locate it", () => {
    const { container } = render(
      <CompactionDivider messageIndex={3} summary="s" canUndo={false} />,
    );

    expect(container.querySelector('[data-message-index="3"]')).not.toBeNull();
  });

  it("hides the undo action when undo is unavailable", () => {
    render(
      <CompactionDivider
        messageIndex={0}
        summary="s"
        canUndo={false}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByText("undo")).toBeNull();
  });

  it("hides the undo action when no onUndo handler is provided", () => {
    render(<CompactionDivider messageIndex={0} summary="s" canUndo={true} />);

    expect(screen.queryByText("undo")).toBeNull();
  });

  it("calls onUndo when undo is clicked", () => {
    const onUndo = vi.fn();

    render(
      <CompactionDivider
        messageIndex={0}
        summary="s"
        canUndo={true}
        onUndo={onUndo}
      />,
    );
    fireEvent.click(screen.getByText("undo"));

    expect(onUndo).toHaveBeenCalledOnce();
  });
});
