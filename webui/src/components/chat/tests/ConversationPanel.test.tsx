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
  {
    id: "conv-1",
    title: "My session",
    createdAt: 1709900000000,
    updatedAt: 1709900000000,
  },
  {
    id: "conv-2",
    title: null,
    createdAt: 1709800000000,
    updatedAt: 1709850000000,
  },
];

const defaultProps = {
  isOpen: true,
  activeConversationId: null as string | null,
  onSelect: vi.fn(),
  onNewConversation: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
};

describe("ConversationPanel", () => {
  it("renders conversation list with titles", () => {
    const { getByText } = render(
      <ConversationPanel {...defaultProps} conversations={conversations} />,
    );

    expect(getByText("My session")).toBeTruthy();
  });

  it("shows timestamp as title when title is null", () => {
    const { container } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={[conversations[1]!]}
      />,
    );

    // The title area should contain the formatted date (fallback)
    const titleEl = container.querySelector(".truncate");

    expect(titleEl?.textContent).toBeTruthy();
  });

  it("shows timestamp below title", () => {
    const { container } = render(
      <ConversationPanel {...defaultProps} conversations={conversations} />,
    );

    // Each conversation has a timestamp row with text-[10px] inside the list
    const listArea = container.querySelector(".overflow-y-auto")!;
    const timestamps = listArea.querySelectorAll(".text-\\[10px\\]");

    expect(timestamps).toHaveLength(2);
  });

  it("highlights active conversation", () => {
    const { container } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        activeConversationId="conv-1"
      />,
    );

    const items = container.querySelectorAll(".overflow-y-auto > button");
    const activeItem = items[0] as HTMLElement;

    expect(activeItem.className).toContain("bg-blue-50");
  });

  it("calls onSelect when clicking a conversation", () => {
    const onSelect = vi.fn();

    const { getByText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(getByText("My session"));

    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("calls onNewConversation when clicking new button", () => {
    const onNew = vi.fn();

    const { getByText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onNewConversation={onNew}
      />,
    );

    fireEvent.click(getByText("+ New Conversation"));

    expect(onNew).toHaveBeenCalledOnce();
  });

  it("calls onDelete when clicking trash icon", () => {
    const onDelete = vi.fn();

    const { getAllByLabelText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(getAllByLabelText("Delete conversation")[0] as HTMLElement);

    expect(onDelete).toHaveBeenCalledWith("conv-1");
  });

  it("supports inline rename: commit, cancel, and empty clears title", () => {
    const onRename = vi.fn();

    const { getAllByLabelText, container, rerender } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onRename={onRename}
      />,
    );

    const pencils = getAllByLabelText("Rename conversation");

    // Commit on Enter
    fireEvent.click(pencils[0] as HTMLElement);
    let input = container.querySelector("input") as HTMLInputElement;

    expect(input.value).toBe("My session");
    fireEvent.input(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("conv-1", "Renamed");

    // Cancel on Escape — re-render to reset editing state
    onRename.mockClear();
    rerender(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onRename={onRename}
      />,
    );
    fireEvent.click(
      container.querySelectorAll(
        "[aria-label='Rename conversation']",
      )[0] as HTMLElement,
    );
    input = container.querySelector("input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBeNull();

    // Empty input clears title to null
    fireEvent.click(
      container.querySelectorAll(
        "[aria-label='Rename conversation']",
      )[0] as HTMLElement,
    );
    input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("conv-1", null);
  });

  it("does not trigger onSelect when clicking edit input", () => {
    const onSelect = vi.fn();

    const { getAllByLabelText, container } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(getAllByLabelText("Rename conversation")[0] as HTMLElement);
    const input = container.querySelector("input") as HTMLInputElement;

    onSelect.mockClear();
    fireEvent.click(input);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect when clicking timestamp row", () => {
    const onSelect = vi.fn();

    const { container } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onSelect={onSelect}
      />,
    );

    // The timestamp row is a full-width button below the title row
    const listArea = container.querySelector(".overflow-y-auto")!;
    const fullWidthButtons = listArea.querySelectorAll("button.w-full");

    // Each conversation has a w-full timestamp button
    fireEvent.click(fullWidthButtons[0] as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("shows empty message when no conversations", () => {
    const { getByText } = render(
      <ConversationPanel {...defaultProps} conversations={[]} />,
    );

    expect(getByText("No conversations yet")).toBeTruthy();
  });
});
