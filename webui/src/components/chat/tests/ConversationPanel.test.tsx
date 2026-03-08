// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { type ConversationSummary } from "#webui/lib/conversation-db";
import { ConversationPanel } from "#webui/components/chat/ConversationPanel";

const conversations: ConversationSummary[] = [
  { id: "conv-1", createdAt: 1709900000000, updatedAt: 1709900000000 },
  { id: "conv-2", createdAt: 1709800000000, updatedAt: 1709850000000 },
];

describe("ConversationPanel", () => {
  it("renders conversation list", () => {
    const { container } = render(
      <ConversationPanel
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const buttons = container.querySelectorAll("button");

    // Close button + New Conversation + 2 conversation items
    expect(buttons).toHaveLength(4);
  });

  it("highlights active conversation", () => {
    const { container } = render(
      <ConversationPanel
        conversations={conversations}
        activeConversationId="conv-1"
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Find the button containing the active conversation
    const buttons = container.querySelectorAll(".overflow-y-auto button");
    const activeButton = buttons[0] as HTMLElement;

    expect(activeButton.className).toContain("bg-blue-50");
  });

  it("calls onSelect when clicking a conversation", () => {
    const onSelect = vi.fn();

    const { container } = render(
      <ConversationPanel
        conversations={conversations}
        activeConversationId={null}
        onSelect={onSelect}
        onNewConversation={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const convButtons = container.querySelectorAll(".overflow-y-auto button");

    fireEvent.click(convButtons[0] as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("calls onNewConversation when clicking new button", () => {
    const onNew = vi.fn();
    const { getByText } = render(
      <ConversationPanel
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={onNew}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(getByText("+ New Conversation"));

    expect(onNew).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking close button", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <ConversationPanel
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(getByLabelText("Close panel"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConversationPanel
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onClose={onClose}
      />,
    );

    const backdrop = container.querySelector('[role="presentation"]');

    fireEvent.click(backdrop as HTMLElement);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows empty message when no conversations", () => {
    const { getByText } = render(
      <ConversationPanel
        conversations={[]}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(getByText("No conversations yet")).toBeTruthy();
  });
});
