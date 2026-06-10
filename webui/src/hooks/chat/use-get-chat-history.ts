// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";

type ClientHistoryRef = { current: { chatHistory: unknown[] } | null };
type PendingHistoryRef = { current: unknown[] | null };

/**
 * Returns a stable accessor for the current chat history: the live client's
 * history if a client exists, else the pending (restored-but-unsent) history,
 * else an empty array.
 * @param clientRef - Ref to the active chat client (null before init/after teardown)
 * @param pendingHistoryRef - Ref to restored-but-unsent history (or null)
 * @returns Stable getter for the current history array
 */
export function useGetChatHistory(
  clientRef: ClientHistoryRef,
  pendingHistoryRef: PendingHistoryRef,
): () => unknown[] {
  return useCallback(
    () => clientRef.current?.chatHistory ?? pendingHistoryRef.current ?? [],
    [clientRef, pendingHistoryRef],
  );
}
