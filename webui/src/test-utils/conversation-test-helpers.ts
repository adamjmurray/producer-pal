// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ConversationRecord,
  type ConversationSummary,
} from "#webui/lib/conversation-db";
import {
  createConversationStore,
  type SaveSnapshot,
} from "#webui/lib/conversations/conversation-store";
import { vi } from "vitest";
import { type UseConversationsReturn } from "#webui/hooks/chat/use-conversations";

/**
 * Create a test ConversationRecord with sensible defaults.
 * @param overrides - Fields to override on the record
 * @returns A complete ConversationRecord
 */
export function createTestRecord(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    ...sharedDefaults(),
    messages: [{ role: "user", content: "hello" }],
    voiceHistory: null,
    ...overrides,
  };
}

/**
 * Create a conversation store whose trunk save has already been persisted —
 * the starting point for the fork/rollback cases.
 * @returns The store and its persisted trunk snapshot
 */
export function storeWithPersistedTrunk() {
  const store = createConversationStore();
  // A fresh store always hands out the first save, so this never returns null.
  const trunk = store.beginSave(false) as SaveSnapshot;

  store.markPersisted(trunk, createTestRecord({ id: trunk.id }));

  return { store, trunk };
}

/**
 * Create a test ConversationSummary with sensible defaults.
 * @param overrides - Fields to override on the summary
 * @returns A complete ConversationSummary
 */
export function createTestSummary(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    ...sharedDefaults(),
    ...overrides,
  };
}

/**
 * Shared default fields for ConversationRecord and ConversationSummary.
 * @returns Default ConversationSummary fields
 */
function sharedDefaults(): ConversationSummary {
  return {
    id: crypto.randomUUID(),
    title: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookmarked: false,
    provider: null,
    model: null,
    modelLabel: null,
    thinking: null,
    smallModelMode: null,
    totalUsage: null,
    sessionType: "text",
  };
}

/**
 * Create a mock conversation manager whose methods all resolve.
 * @param overrides - Fields to override on the manager
 * @returns A complete mock manager
 */
export function createMockConversationsManager(
  overrides: Partial<UseConversationsReturn> = {},
): UseConversationsReturn {
  return {
    conversations: [],
    activeConversationId: null,
    notification: null,
    dismissNotification: vi.fn(),
    saveCurrentConversation: vi.fn().mockResolvedValue(undefined),
    switchConversation: vi.fn().mockResolvedValue(undefined),
    startNewConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    deleteAllConversations: vi.fn().mockResolvedValue(undefined),
    deleteUnbookmarkedConversations: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    toggleBookmark: vi.fn().mockResolvedValue(undefined),
    refreshList: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
