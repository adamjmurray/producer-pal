// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationList,
  type ConversationListProps,
} from "#webui/components/chat/ConversationList";
import { createTestSummary } from "#webui/test-utils/conversation-test-helpers";

const handlers = {
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onExportItem: vi.fn(),
  onRename: vi.fn(),
  onToggleBookmark: vi.fn(),
};

function renderList(overrides: Partial<ConversationListProps> = {}) {
  const props: ConversationListProps = {
    conversations: [],
    activeConversationId: null,
    searchQuery: "",
    matchedIds: null,
    ...handlers,
    ...overrides,
  };

  return render(<ConversationList {...props} />);
}

describe("ConversationList", () => {
  it("renders a bookmarked conversation in both the Bookmarks and All sections", () => {
    // This dual render (bookmarked ⊆ visible) is exactly why each section's
    // ConversationItem key is namespaced (#45): a bare conv.id would collide
    // across the two sibling lists, producing duplicate React keys.
    const bookmarked = createTestSummary({ title: "Pinned", bookmarked: true });
    const plain = createTestSummary({ title: "Plain" });

    const { getAllByText, queryAllByText } = renderList({
      conversations: [bookmarked, plain],
    });

    // The bookmarked conversation shows in both sections; the plain one only in
    // All Conversations.
    expect(getAllByText("Pinned")).toHaveLength(2);
    expect(queryAllByText("Plain")).toHaveLength(1);
  });

  it("starts an untitled conversation's rename from an empty field", () => {
    const untitled = createTestSummary({ title: null });

    const { getByLabelText } = renderList({ conversations: [untitled] });

    fireEvent.click(getByLabelText("Rename conversation"));

    expect(
      (getByLabelText("Conversation title") as HTMLInputElement).value,
    ).toBe("");
  });

  it("opens exactly one edit input when renaming a bookmarked conversation", () => {
    // The bookmarked conversation renders in both sections, so there are two
    // Rename buttons. Clicking one must open a single edit input — keying edit
    // mode by bare id put both instances into edit mode (two autoFocus inputs),
    // which committed the rename before the user could type.
    const bookmarked = createTestSummary({ title: "Pinned", bookmarked: true });

    const { getAllByLabelText, queryAllByLabelText } = renderList({
      conversations: [bookmarked],
    });

    const renameButtons = getAllByLabelText("Rename conversation");

    expect(renameButtons).toHaveLength(2);

    fireEvent.click(renameButtons[0]!);

    expect(queryAllByLabelText("Conversation title")).toHaveLength(1);
  });
});
