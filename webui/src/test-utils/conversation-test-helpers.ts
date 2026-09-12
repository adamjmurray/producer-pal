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
} from "#webui/lib/conversation-store";

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
