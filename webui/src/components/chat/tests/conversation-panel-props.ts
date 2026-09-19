// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";

/**
 * The conversation-panel list state and callbacks shared by the panel's own
 * tests and the ChatScreen tests that pass them straight through.
 * @returns Panel props with fresh mock callbacks
 */
export function conversationPanelProps() {
  return {
    activeConversationId: null as string | null,
    searchQuery: "",
    matchedIds: null as Set<string> | null,
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onExportItem: vi.fn(),
    onRename: vi.fn(),
    onToggleBookmark: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    notification: null as { message: string; type: "success" | "error" } | null,
    onDismissNotification: vi.fn(),
  };
}
