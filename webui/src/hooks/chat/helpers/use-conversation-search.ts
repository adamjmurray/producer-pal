// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import {
  type ConversationSummary,
  searchConversations,
} from "#webui/lib/conversation-db";

/** Debounce before scanning transcripts, so typing doesn't re-read every record per keystroke. */
const SEARCH_DEBOUNCE_MS = 150;

export interface UseConversationSearchReturn {
  /** Current search query text. */
  searchQuery: string;
  /** Update the search query. */
  setSearchQuery: (query: string) => void;
  /** IDs matching the active query, or null when no search is active. */
  matchedIds: Set<string> | null;
}

/**
 * Owns conversation-search state: a query string plus the debounced set of
 * matching conversation IDs (title + message text). Re-runs when the query or
 * the conversation list changes, so results stay live as conversations are
 * added, renamed, or deleted.
 * @param conversations - Current conversation summaries; identity changes on each refresh
 * @returns Search query state and the set of matching IDs (null = no active search)
 */
export function useConversationSearch(
  conversations: ConversationSummary[],
): UseConversationSearchReturn {
  const [searchQuery, setSearchQuery] = useState("");
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      setMatchedIds(null);

      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void searchConversations(query).then((ids) => {
        if (!cancelled) setMatchedIds(ids);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, conversations]);

  return { searchQuery, setSearchQuery, matchedIds };
}
