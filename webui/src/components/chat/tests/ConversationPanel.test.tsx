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
        isOpen={true}
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const buttons = container.querySelectorAll("button");

    // New Conversation + 2 × (select + delete)
    expect(buttons).toHaveLength(5);
  });

  it("highlights active conversation", () => {
    const { container } = render(
      <ConversationPanel
        isOpen={true}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // Find the div containing the active conversation
    const items = container.querySelectorAll(".overflow-y-auto > div");
    const activeItem = items[0] as HTMLElement;

    expect(activeItem.className).toContain("bg-blue-50");
  });

  it("calls onSelect when clicking a conversation", () => {
    const onSelect = vi.fn();

    const { container } = render(
      <ConversationPanel
        isOpen={true}
        conversations={conversations}
        activeConversationId={null}
        onSelect={onSelect}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
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
        isOpen={true}
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={onNew}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(getByText("+ New Conversation"));

    expect(onNew).toHaveBeenCalledOnce();
  });

  it("calls onDelete when clicking trash icon", () => {
    const onDelete = vi.fn();

    const { getAllByLabelText } = render(
      <ConversationPanel
        isOpen={true}
        conversations={conversations}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(getAllByLabelText("Delete conversation")[0] as HTMLElement);

    expect(onDelete).toHaveBeenCalledWith("conv-1");
  });

  it("shows empty message when no conversations", () => {
    const { getByText } = render(
      <ConversationPanel
        isOpen={true}
        conversations={[]}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(getByText("No conversations yet")).toBeTruthy();
  });
});
