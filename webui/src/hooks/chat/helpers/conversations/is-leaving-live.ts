// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ConversationStore } from "#webui/lib/conversations/conversation-store";

/**
 * Whether tearing down the live chat leaves anything behind. An empty new chat
 * has nothing to leave, so the composer's draft stays. A new chat with messages
 * but no id yet (first send not saved) is not empty. Read before a bulk delete
 * marks the live conversation deleted, which empties its id.
 * @param store - The store holding the live conversation
 * @param getChatHistory - Returns the live chat's messages
 * @returns True when there is a conversation to leave
 */
export function isLeavingLive(
  store: ConversationStore,
  getChatHistory: () => unknown[],
): boolean {
  return store.activeId() != null || getChatHistory().length > 0;
}
