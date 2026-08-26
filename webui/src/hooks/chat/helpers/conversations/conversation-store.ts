// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ActiveMeta,
  DEFAULT_META,
} from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import { type ConversationRecord } from "#webui/lib/conversation-db";

/**
 * How far the live conversation has got toward having a row on disk.
 *
 * - `fresh` — nothing saved yet, so the sidebar and URL hash show no id.
 * - `claimed` — a save has started, so the id is published, but no row exists.
 * - `persisted` — a write has landed.
 * - `deleted` — a delete is taking this conversation away; no save may start.
 */
export type SlotState = "fresh" | "claimed" | "persisted" | "deleted";

/** What a save captured about the conversation it belongs to, at call time. */
export interface SaveSnapshot {
  /** The record this save writes. */
  id: string;
  /**
   * Whether {@link id} already had a row when the save started, which is what
   * lets the write transaction treat a missing row as proof of a delete.
   */
  expectPersisted: boolean;
  /**
   * The stored record this save continues, which it reads back to carry
   * forward what it must not drop (creation time, branch linkage): the source
   * for a fork, the conversation's own id for a follow-up save, and null for
   * the first save of a new conversation.
   *
   * Not the same as {@link expectPersisted}: a follow-up fired before the
   * first save's write lands still continues that record — the queue puts the
   * write first — but has no row to check yet.
   */
  reuseId: string | null;
  /** For a fork, the conversation it branches off; null for a normal save. */
  sourceId: string | null;
  fork: PendingFork | null;
}

/**
 * The one conversation the user is on, and the queue of writes for it.
 *
 * A save may only be refused for one reason: the conversation it belongs to is
 * being deleted. Two checks cover that, split by whether there is a row to look
 * at.
 *
 * The record exists: the write transaction refuses it — see saveConversation's
 * `expectPersisted`. That check lives in the DB rather than here because a
 * tab-local answer goes stale in both directions, missing another tab's delete
 * and going on rejecting after the record legitimately comes back.
 *
 * The record doesn't exist yet: the delete marks the slot, and no save can
 * start on a slot marked deleted. Saves already queued are covered by the
 * delete draining them first.
 *
 * Note what is deliberately NOT a reason to refuse: the user having moved on.
 * Every save carries the id it was started for, so it belongs in that record
 * whatever the user is looking at now — clicking New while the first save of a
 * conversation is in flight must not lose it.
 */
export interface ConversationStore {
  /** Id for the sidebar and the URL hash; null while the chat is unsaved. */
  activeId: () => string | null;
  /** The active conversation's metadata. Written in place by useSyncActiveMeta. */
  metaRef: { current: ActiveMeta | null };
  /**
   * Claim the live conversation's id and stamp a snapshot to validate later.
   * Null when a delete is taking that conversation away — no save may start
   * for it, and one that starts on a fresh id would just write the deleted
   * conversation's history back under a new name.
   */
  beginSave: (fork: PendingFork | null) => SaveSnapshot | null;
  /** Record that a snapshot's write landed, and adopt what it wrote. */
  markPersisted: (snapshot: SaveSnapshot, record: ConversationRecord) => void;
  /** Move onto an existing conversation. */
  adopt: (record: ConversationRecord) => void;
  /**
   * Mark the live conversation as being deleted.
   * @returns Undo, for a delete that fails and leaves the row in place.
   */
  markDeleted: () => () => void;
  /** Leave the live conversation for a fresh, unsaved one. */
  reset: () => void;
  /** Run work after any save already queued, so reads and writes stay ordered. */
  enqueue: (work: () => Promise<void>) => Promise<void>;
  /** Wait for the queued saves — the ones a delete must not race. */
  drain: () => Promise<void>;
  /** Called whenever {@link activeId} changes. */
  onActiveIdChange: (listener: (id: string | null) => void) => void;
}

/**
 * Create the conversation store backing one mounted chat session.
 *
 * Per-mount rather than module-wide: only one of chat and voice is live at a
 * time, and the mode swap hands the conversation over through the URL hash, so
 * a shared instance would only couple the two.
 * @param restoredId - Conversation id read from the URL hash on a page load
 * @returns A store holding that conversation, or a fresh unsaved one
 */
export function createConversationStore(
  restoredId?: string | null,
): ConversationStore {
  // A page load with a conversation in the URL hash starts on that record, so
  // the first list refresh can highlight it. The mount then loads it for real
  // and resets if it has gone.
  let slot: Slot =
    restoredId == null ? freshSlot() : { id: restoredId, state: "persisted" };
  let queue: Promise<void> = Promise.resolve();
  let notify: (id: string | null) => void = noop;
  const metaRef: { current: ActiveMeta | null } = { current: null };

  const activeId = (): string | null =>
    slot.state === "fresh" || slot.state === "deleted" ? null : slot.id;

  /**
   * Move to a new live conversation, telling the listener when what the
   * sidebar and URL hash show has changed.
   * @param next - The slot replacing the current one
   */
  const enter = (next: Slot): void => {
    const before = activeId();

    slot = next;

    if (activeId() !== before) notify(activeId());
  };

  return {
    activeId,
    metaRef,

    beginSave: (fork) => {
      if (slot.state === "deleted") return null;

      // A fork leaves its source intact and branches onto a new record, so it
      // starts a new live conversation rather than writing the current one.
      // Both the id and the generation move here, synchronously, so a second
      // save racing this one can't mint a second branch. With nothing saved to
      // branch from, there is no source and it degrades to a normal save.
      const sourceId = fork != null && slot.state !== "fresh" ? slot.id : null;

      if (fork != null) enter(freshSlot());

      const snapshot: SaveSnapshot = {
        id: slot.id,
        expectPersisted: slot.state === "persisted",
        reuseId: sourceId ?? (slot.state === "fresh" ? null : slot.id),
        sourceId,
        fork,
      };

      // Publish the id now rather than when the write lands: the sidebar
      // highlight and the URL hash have to follow the conversation as soon as
      // it has an id to follow.
      if (slot.state === "fresh") enter({ ...slot, state: "claimed" });

      return snapshot;
    },

    markPersisted: (snapshot, record) => {
      // The write may have landed for a conversation the user has since left.
      // It belongs in that record either way, but it says nothing about this one.
      if (snapshot.id !== slot.id) return;

      metaRef.current = metaFromRecord(record);
      enter({ ...slot, state: "persisted" });
    },

    adopt: (record) => {
      metaRef.current = metaFromRecord(record);
      enter({ id: record.id, state: "persisted" });
    },

    markDeleted: () => {
      const before = slot;

      enter({ ...slot, state: "deleted" });

      return () => {
        if (slot.state === "deleted" && slot.id === before.id) enter(before);
      };
    },

    reset: () => {
      metaRef.current = null;
      enter(freshSlot());
    },

    enqueue: (work) => {
      const next = queue.then(work);

      queue = next;

      return next;
    },

    drain: () => queue,

    onActiveIdChange: (listener) => {
      notify = listener;
    },
  };
}

/**
 * Metadata for a conversation the store has just loaded or written.
 * @param record - The record to read metadata off
 * @returns A metadata snapshot for the store
 */
export function metaFromRecord(record: ConversationRecord): ActiveMeta {
  return {
    ...DEFAULT_META,
    title: record.title,
    createdAt: record.createdAt,
    bookmarked: record.bookmarked,
    model: record.model,
    provider: record.provider as ActiveMeta["provider"],
    thinking: record.thinking,
    smallModelMode: record.smallModelMode ?? null,
    systemInstruction: record.systemInstruction ?? null,
    notation: record.notation ?? null,
    enabledTools: record.enabledTools ?? null,
  };
}

// --- Helpers below main export ---

/** Listener stand-in until the hook registers one. */
function noop(): void {}

/** The one conversation the user is on. */
interface Slot {
  id: string;
  state: SlotState;
}

/**
 * A brand-new unsaved conversation. Its id is minted here rather than inside
 * the first save: a delete that lands before that save has to have something to
 * name, and lazily-minted ids are exactly what made the old code reserve one by
 * hand.
 * @returns The fresh slot
 */
function freshSlot(): Slot {
  return { id: crypto.randomUUID(), state: "fresh" };
}
