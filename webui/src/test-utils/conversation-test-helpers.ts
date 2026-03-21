// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ConversationRecord,
  type ConversationSummary,
} from "#webui/lib/conversation-db";

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
    ...overrides,
  };
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
    temperature: null,
    showThoughts: null,
    smallModelMode: null,
    totalUsage: null,
  };
}
