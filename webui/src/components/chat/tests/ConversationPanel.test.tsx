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
      />,
    );

    const buttons = container.querySelectorAll("button");

    // New Conversation + 2 conversation items
    expect(buttons).toHaveLength(3);
  });

  it("highlights active conversation", () => {
    const { container } = render(
      <ConversationPanel
        isOpen={true}
        conversations={conversations}
        activeConversationId="conv-1"
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
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
        isOpen={true}
        conversations={conversations}
        activeConversationId={null}
        onSelect={onSelect}
        onNewConversation={vi.fn()}
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
      />,
    );

    fireEvent.click(getByText("+ New Conversation"));

    expect(onNew).toHaveBeenCalledOnce();
  });

  it("shows empty message when no conversations", () => {
    const { getByText } = render(
      <ConversationPanel
        isOpen={true}
        conversations={[]}
        activeConversationId={null}
        onSelect={vi.fn()}
        onNewConversation={vi.fn()}
      />,
    );

    expect(getByText("No conversations yet")).toBeTruthy();
  });
});
