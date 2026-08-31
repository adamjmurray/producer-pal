// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ActiveRefs,
  buildConversationSaveRecord,
} from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import {
  type PendingFork,
  type PendingForkRef,
} from "#webui/hooks/chat/use-chat-types";
import {
  type ConversationStore,
  type SaveSnapshot,
} from "#webui/lib/conversation-store";
import {
  type EnforceLimitResult,
  saveConversation,
} from "#webui/lib/conversation-db";

/**
 * A fork write can keep failing (a full quota, say). Once this many attempts
 * for one fork have failed, stop retrying it rather than spin forever, and
 * tell the user their save was dropped.
 */
export const MAX_FORK_SAVE_ATTEMPTS = 3;

/** The subset of useLimitNotification a save needs to report its outcome. */
interface SaveNotifier {
  showSaveRefused: () => void;
  showLimitNotification: (result: EnforceLimitResult) => void;
  showSaveError: (error: unknown) => void;
}

export interface WriteConversationArgs {
  snapshot: SaveSnapshot;
  fork: PendingFork | null;
  refs: ActiveRefs;
  chatHistory: unknown[];
  updatedAt: number | undefined;
  store: ConversationStore;
  pendingForkRef?: PendingForkRef;
  /**
   * Failed fork-write attempts, keyed by the id that died. Shared (by the
   * caller) across every save queued behind the same failed fork, so the
   * {@link MAX_FORK_SAVE_ATTEMPTS} bound holds across all of them rather than
   * resetting per save.
   */
  deadForkAttempts: Map<string, number>;
  limit: SaveNotifier;
  refreshList: () => Promise<void>;
}

/**
 * Write the live conversation. If a fork ahead of this save in the queue
 * rolled back and killed the id this save was holding (reused via reuseId),
 * writing under it would resurrect it as an orphaned record with no branch
 * linkage. Recover instead: take over the fork retry (or, if it already
 * succeeded, continue whatever the store is on now) rather than dropping the
 * content or falling back to overwriting the trunk.
 * @param args - Save inputs, the store, and the shared retry bookkeeping
 */
export async function writeConversation(
  args: WriteConversationArgs,
): Promise<void> {
  const {
    chatHistory,
    updatedAt,
    store,
    pendingForkRef,
    deadForkAttempts,
    limit,
    refreshList,
  } = args;
  let { snapshot, fork, refs } = args;

  if (!snapshot.stillLive()) {
    // Already gave up on this fork, and already told the user — a plain
    // continuation now would land on whatever the store fell back to
    // (the trunk), silently overwriting the history forking protects.
    if (
      (deadForkAttempts.get(args.snapshot.id) ?? 0) >= MAX_FORK_SAVE_ATTEMPTS
    ) {
      return;
    }

    // Take over a fork retry if one is still pending, otherwise this save
    // just continues whatever the store is on now — a prior save in this
    // same recovery already succeeded.
    const revived = pendingForkRef?.current ?? null;

    if (pendingForkRef) pendingForkRef.current = null;

    const retrySnapshot = store.beginSave(revived != null);

    if (!retrySnapshot) return;

    snapshot = retrySnapshot;
    fork = revived;
    refs = { ...refs, id: snapshot.id };
  }

  try {
    const record = await buildConversationSaveRecord({
      id: snapshot.id,
      reuseId: snapshot.reuseId,
      fork,
      refs,
      chatHistory,
      updatedAt,
    });

    const result = await saveConversation(record, {
      expectPersisted: snapshot.expectPersisted,
    });

    // Refused, not failed: the row is gone — another tab deleted it, or
    // an import's limit trim evicted it — and the transaction won't write
    // a deleted conversation back. The slot stays as it was, so an undo
    // that restores the row lets the next save land again.
    if (!result.saved) {
      limit.showSaveRefused();

      return;
    }

    store.markPersisted(snapshot, record);
    limit.showLimitNotification(result);
    await refreshList();
  } catch (error) {
    // The branch was never written, so undo the claim and put the fork
    // signal back (unless a newer one has taken its place). Without both,
    // the next save takes the plain first-save path from the failed
    // branch's own id: no link to the trunk, and the trunk's title and
    // bookmark copied onto a record that isn't it.
    snapshot.rollback();

    if (fork != null) {
      const deadId = args.snapshot.id;
      const attempts = (deadForkAttempts.get(deadId) ?? 0) + 1;

      deadForkAttempts.set(deadId, attempts);

      if (
        attempts < MAX_FORK_SAVE_ATTEMPTS &&
        pendingForkRef &&
        pendingForkRef.current == null
      ) {
        pendingForkRef.current = fork;
      }
    }

    // App.tsx fire-and-forgets this call, so surface the failure here
    // instead of letting it become an unhandled rejection
    console.error("Failed to save conversation", error);
    limit.showSaveError(error);
  }
}
