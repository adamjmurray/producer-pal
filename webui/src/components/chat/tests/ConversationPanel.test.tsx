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
import { createTestSummary } from "#webui/test-utils/conversation-test-helpers";

const conversations: ConversationSummary[] = [
  createTestSummary({
    id: "conv-1",
    title: "My session",
    createdAt: 1709900000000,
    updatedAt: 1709900000000,
    provider: "gemini",
    model: "gemini-2.5-pro",
    modelLabel: "Gemini 2.5 Pro",
  }),
  createTestSummary({
    id: "conv-2",
    createdAt: 1709800000000,
    updatedAt: 1709850000000,
  }),
];

const defaultProps = {
  isOpen: true,
  activeConversationId: null as string | null,
  onSelect: vi.fn(),
  onNewConversation: vi.fn(),
  onDelete: vi.fn(),
  onExportItem: vi.fn(),
  onRename: vi.fn(),
  onToggleBookmark: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
  notification: null as { message: string; type: "success" | "error" } | null,
  onDismissNotification: vi.fn(),
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

    // Each conversation has a metadata row with timestamp (and optionally model)
    const listArea = container.querySelector(".overflow-y-auto")!;
    const metaRows = listArea.querySelectorAll(
      "button.text-left > .text-\\[10px\\]",
    );

    // One metadata row per conversation
    expect(metaRows).toHaveLength(2);
  });

  it("highlights active conversation", () => {
    const { container } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        activeConversationId="conv-1"
      />,
    );

    const items = container.querySelectorAll(
      ".overflow-y-auto button.text-left",
    );
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

    fireEvent.click(getByText("New Conversation"));

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

  it("calls onExportItem when clicking export icon", () => {
    const onExportItem = vi.fn();

    const { getAllByLabelText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onExportItem={onExportItem}
      />,
    );

    fireEvent.click(getAllByLabelText("Export conversation")[0] as HTMLElement);

    expect(onExportItem).toHaveBeenCalledWith("conv-1");
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

    // Conversation items are w-full text-left buttons
    const listArea = container.querySelector(".overflow-y-auto")!;
    const convButtons = listArea.querySelectorAll("button.text-left");

    fireEvent.click(convButtons[0] as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("shows provider and model right-aligned when model is set", () => {
    const { container } = render(
      <ConversationPanel {...defaultProps} conversations={conversations} />,
    );

    const modelEl = container.querySelector(".text-right");

    expect(modelEl?.textContent).toContain("Google");
    expect(modelEl?.textContent).toContain("Gemini 2.5 Pro");
  });

  it("shows stored model label when model ID is not in presets", () => {
    const oldConv: ConversationSummary[] = [
      createTestSummary({
        id: "conv-old",
        title: "Old session",
        createdAt: 1709900000000,
        updatedAt: 1709900000000,
        provider: "gemini",
        model: "gemini-1.5-pro-removed",
        modelLabel: "Gemini 1.5 Pro",
      }),
    ];

    const { container } = render(
      <ConversationPanel {...defaultProps} conversations={oldConv} />,
    );

    const modelEl = container.querySelector(".text-right");

    expect(modelEl?.textContent).toContain("Gemini 1.5 Pro");
  });

  it("shows model ID when no stored label and model not in presets", () => {
    const unknownModelConv: ConversationSummary[] = [
      createTestSummary({
        id: "conv-unknown",
        title: "Unknown model session",
        createdAt: 1709900000000,
        updatedAt: 1709900000000,
        model: "custom-model-xyz",
      }),
    ];

    const { container } = render(
      <ConversationPanel {...defaultProps} conversations={unknownModelConv} />,
    );

    const modelEl = container.querySelector(".text-right");

    expect(modelEl?.textContent).toContain("custom-model-xyz");
  });

  it("shows token usage when totalUsage is set", () => {
    const withUsage: ConversationSummary[] = [
      {
        ...conversations[0]!,
        totalUsage: { inputTokens: 17123, outputTokens: 456 },
      },
    ];

    const { container } = render(
      <ConversationPanel {...defaultProps} conversations={withUsage} />,
    );

    const usageEl = container.querySelector("[title*='token usage']");

    expect(usageEl?.textContent).toContain("17.1K");
    expect(usageEl?.textContent).toContain("456");
  });

  it("does not show model when model is null", () => {
    const { container } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={[conversations[1]!]}
      />,
    );

    const modelEl = container.querySelector(".text-right");

    expect(modelEl).toBeNull();
  });

  it("shows empty message when no conversations", () => {
    const { getByText } = render(
      <ConversationPanel {...defaultProps} conversations={[]} />,
    );

    expect(getByText("No conversations yet")).toBeTruthy();
  });

  it("renders star button for each conversation", () => {
    const { getAllByLabelText } = render(
      <ConversationPanel {...defaultProps} conversations={conversations} />,
    );

    expect(getAllByLabelText("Bookmark conversation")).toHaveLength(2);
  });

  it("calls onToggleBookmark when clicking star", () => {
    const onToggleBookmark = vi.fn();

    const { getAllByLabelText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onToggleBookmark={onToggleBookmark}
      />,
    );

    fireEvent.click(
      getAllByLabelText("Bookmark conversation")[0] as HTMLElement,
    );

    expect(onToggleBookmark).toHaveBeenCalledWith("conv-1");
  });

  it("shows Bookmarks section when bookmarked conversations exist", () => {
    const mixed: ConversationSummary[] = [
      { ...conversations[0]!, bookmarked: true },
      { ...conversations[1]!, bookmarked: false },
    ];

    const { getByText } = render(
      <ConversationPanel {...defaultProps} conversations={mixed} />,
    );

    expect(getByText(/Bookmarks \(1\)/)).toBeTruthy();
    expect(getByText(/All Conversations \(2\)/)).toBeTruthy();
  });

  it("does not show Bookmarks section when none are bookmarked", () => {
    const { queryByText } = render(
      <ConversationPanel {...defaultProps} conversations={conversations} />,
    );

    expect(queryByText(/Bookmarks/)).toBeNull();
  });

  it("shows only Bookmarks section when all are bookmarked", () => {
    const allBookmarked = conversations.map((c) => ({
      ...c,
      bookmarked: true,
    }));

    const { getByText, queryByText } = render(
      <ConversationPanel {...defaultProps} conversations={allBookmarked} />,
    );

    expect(getByText(/Bookmarks \(2\)/)).toBeTruthy();
    // All Conversations section still shows (contains all items)
    expect(queryByText(/All Conversations \(2\)/)).toBeTruthy();
  });

  it("collapses and expands sections when clicking headers", () => {
    const mixed: ConversationSummary[] = [
      { ...conversations[0]!, bookmarked: true },
      { ...conversations[1]!, bookmarked: false },
    ];

    const { getAllByText, getByText, container } = render(
      <ConversationPanel {...defaultProps} conversations={mixed} />,
    );

    // Bookmarked item appears in both sections initially
    expect(getAllByText("My session")).toHaveLength(2);

    // Collapse Bookmarks — one copy removed
    fireEvent.click(getByText(/Bookmarks \(1\)/));
    expect(getAllByText("My session")).toHaveLength(1);

    // Collapse All Conversations
    fireEvent.click(getByText(/All Conversations \(2\)/));
    const convItems = container.querySelectorAll("button.text-left");

    expect(convItems).toHaveLength(0);

    // Expand All Conversations
    fireEvent.click(getByText(/All Conversations \(2\)/));
    expect(getAllByText("My session")).toHaveLength(1);
  });

  it("shows filled star for bookmarked conversations", () => {
    const mixed: ConversationSummary[] = [
      { ...conversations[0]!, bookmarked: true },
      { ...conversations[1]!, bookmarked: false },
    ];

    const { getAllByLabelText } = render(
      <ConversationPanel {...defaultProps} conversations={mixed} />,
    );

    // Bookmarked item appears in both Bookmarks and All Conversations sections
    expect(getAllByLabelText("Remove bookmark")).toHaveLength(2);
    expect(getAllByLabelText("Bookmark conversation")).toHaveLength(1);
  });

  it("renders export and import buttons", () => {
    const { getByLabelText } = render(
      <ConversationPanel {...defaultProps} conversations={conversations} />,
    );

    expect(getByLabelText("Export conversations")).toBeTruthy();
    expect(getByLabelText("Import conversations")).toBeTruthy();
  });

  it("calls onExport when clicking export button", () => {
    const onExport = vi.fn();

    const { getByLabelText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onExport={onExport}
      />,
    );

    fireEvent.click(getByLabelText("Export conversations"));

    expect(onExport).toHaveBeenCalledOnce();
  });

  it("calls onImport when clicking import button", () => {
    const onImport = vi.fn();

    const { getByLabelText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        onImport={onImport}
      />,
    );

    fireEvent.click(getByLabelText("Import conversations"));

    expect(onImport).toHaveBeenCalledOnce();
  });

  it("shows notification when set", () => {
    const { getByText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        notification={{ message: "Exported 5 conversations", type: "success" }}
      />,
    );

    expect(getByText("Exported 5 conversations")).toBeTruthy();
  });

  it("calls onDismissNotification when dismissing", () => {
    const onDismiss = vi.fn();

    const { getByLabelText } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        notification={{ message: "Done", type: "success" }}
        onDismissNotification={onDismiss}
      />,
    );

    fireEvent.click(getByLabelText("Dismiss notification"));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not show notification when null", () => {
    const { queryByRole } = render(
      <ConversationPanel
        {...defaultProps}
        conversations={conversations}
        notification={null}
      />,
    );

    expect(queryByRole("status")).toBeNull();
  });
});
