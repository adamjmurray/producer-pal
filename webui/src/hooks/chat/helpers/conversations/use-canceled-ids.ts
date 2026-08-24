// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useMemo, useRef } from "preact/hooks";
import { deleteConversationWithSnapshot } from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import { type ConversationRecord } from "#webui/lib/conversation-db";

/** Tombstones for conversations whose pending/in-flight save must be abandoned. */
export interface CanceledIds {
  /** The raw set, for helpers that take it by ref (the bulk deletes). */
  ref: { current: Set<string> };
  /** Abandon any save for this id from here on. */
  cancel: (id: string) => void;
  /** Lift a tombstone: the record is back, or never left. */
  uncancel: (id: string) => void;
  /** Whether a save for this id must bail instead of writing. */
  isCanceled: (id: string) => boolean;
  /** Delete under a tombstone, lifting it again if the delete fails. */
  deleteTombstoned: (
    id: string,
    onSnapshot: (record: ConversationRecord) => void,
  ) => Promise<void>;
}

/**
 * Track which conversations a delete has taken out from under an autosave.
 *
 * The delete paths drain the save chain, but that only covers saves already
 * queued — a save enqueued *after* the drain (chiefly the stream-teardown
 * autosave that stopResponse() triggers) would still resurrect the just-deleted
 * row. Every save checks {@link CanceledIds.isCanceled} right before its DB
 * write and bails.
 *
 * A tombstone must come back down when the record does, or it silently drops
 * every later autosave for that id and the user loses everything they type from
 * then on. Three ways that happens: undo restores the record under its original
 * id, an import re-adds a previously-deleted one (export keeps ids), and a
 * delete that failed leaves the row in place.
 * @returns The tombstone set and its operations
 */
export function useCanceledIds(): CanceledIds {
  const ref = useRef<Set<string>>(new Set());

  const cancel = useCallback((id: string) => {
    ref.current.add(id);
  }, []);

  const uncancel = useCallback((id: string) => {
    ref.current.delete(id);
  }, []);

  const isCanceled = useCallback((id: string) => ref.current.has(id), []);

  const deleteTombstoned = useCallback(
    async (id: string, onSnapshot: (record: ConversationRecord) => void) => {
      try {
        await deleteConversationWithSnapshot(id, onSnapshot);
      } catch (error) {
        // The row survived, so the tombstone is now a lie — leaving it would
        // make a conversation that is still listed permanently unsaveable.
        uncancel(id);
        throw error;
      }
    },
    [uncancel],
  );

  return useMemo(
    () => ({ ref, cancel, uncancel, isCanceled, deleteTombstoned }),
    [cancel, uncancel, isCanceled, deleteTombstoned],
  );
}
