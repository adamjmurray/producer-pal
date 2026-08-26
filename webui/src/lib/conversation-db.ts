// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type IDBPDatabase } from "idb";
import { type Notation } from "#src/shared/notation";
import { type ChatMessage, type TokenUsage } from "#webui/chat/sdk/types";
import { collapseBranchFamilies } from "#webui/lib/conversation-branch-helpers";
import { STORE_NAME, tryOpenDb } from "#webui/lib/conversation-db-helpers";

export const MAX_CONVERSATIONS = 200;

/** Distinguishes chat (text) from voice transcripts. Older records are treated as "text". */
export type SessionType = "text" | "voice";

/** Full conversation record stored in IndexedDB */
export interface ConversationRecord {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  bookmarked: boolean;
  provider: string | null;
  model: string | null;
  modelLabel: string | null;
  thinking: string | null;
  smallModelMode: boolean | null;
  totalUsage: TokenUsage | null;
  sessionType: SessionType;
  messages: ChatMessage[];
  // RealtimeItem[] for voice records, null for text. Typed as unknown[] so the
  // storage layer stays decoupled from @openai/agents/realtime.
  voiceHistory: unknown[] | null;
  // The system instruction this conversation ran with (resolved override or the
  // built-in), snapshotted at the first save and preserved on later saves so the
  // transcript shows what it actually ran with even after the global override is
  // edited. Optional/schemaless: legacy records read fine without it (no
  // DB_VERSION bump), and it rides the conversation export/import.
  systemInstruction?: string;
  // The notation this conversation ran with, snapshotted on the same terms as
  // systemInstruction. Restoring a conversation sends this rather than the
  // current device global, so a transcript written in one notation keeps being
  // parsed in it. Optional/schemaless: legacy records read fine without it (no
  // DB_VERSION bump), and it rides the conversation export/import.
  notation?: Notation;
  // The tool selection this conversation runs with, pinned like the two snapshots
  // above: a transcript full of calls to a tool is itself an instruction to keep
  // calling it, so restoring re-sends this rather than the current selection.
  // Written from the already-pinned active toolset on every save rather than
  // frozen at the first. Optional/schemaless: legacy records read fine without it
  // (no DB_VERSION bump) and reconnect on the current selection, and it rides the
  // conversation export/import.
  enabledTools?: Record<string, boolean>;
  // --- Conversation branching (edit/retry forks) ---
  // Set on records created by forking an earlier turn. The fork stores a pointer
  // back to the record it diverged from (its "trunk") plus the UI message index
  // the ‹ n/m › arrows sit under. Absent on non-forked records. Schemaless: these
  // are optional, so legacy records read fine without a DB_VERSION bump.
  /** Id of the record this was forked from (the trunk of its divergence set). */
  forkParentId?: string;
  /** UI message index where this fork's arrows anchor (the fork-point message). */
  forkedAtIndex?: number;
}

/** Lightweight summary for list display (no transcript payload) */
export type ConversationSummary = Omit<
  ConversationRecord,
  "messages" | "voiceHistory"
>;

/** Result of enforcing the conversation limit during save */
export interface EnforceLimitResult {
  deletedCount: number;
  /** True when all slots are consumed by bookmarked conversations */
  limitReached: boolean;
}

/** Options for {@link saveConversation}. */
export interface SaveConversationOptions {
  /** Ids the limit must NOT trim (e.g. the whole batch during an import, so
   * saving one imported record can't delete another just-imported record that
   * happens to carry an older timestamp). */
  protectedIds?: ReadonlySet<string>;
  /**
   * True when this record has been written before, which makes a missing row
   * proof that it was deleted — so the write is refused instead of resurrecting
   * it. This is the anti-resurrection guard, and it lives here rather than in
   * the caller for two reasons: it reads the store inside the write transaction,
   * so it also holds against a delete from another tab; and it heals itself when
   * the record legitimately comes back (undo, import), unlike a tombstone
   * somebody has to remember to lift.
   *
   * False for a first save — there is nothing on disk to resurrect. Losing a
   * brand-new conversation the user just deleted is the caller's problem (see
   * the conversation store's generation check).
   */
  expectPersisted?: boolean;
}

/** Outcome of a {@link saveConversation} call. */
export interface SaveConversationResult extends EnforceLimitResult {
  /** False when the record was deleted before the write, so nothing was written. */
  saved: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (or return cached) the conversations database.
 * @returns IndexedDB database instance
 */
export function getConversationDb(): Promise<IDBPDatabase> {
  dbPromise ??= tryOpenDb();

  return dbPromise;
}

/**
 * Save or update a conversation record, enforcing the conversation limit.
 *
 * The existence check, the limit trim, and the write share one transaction, so
 * a delete can't land between them. See {@link SaveConversationOptions.expectPersisted}.
 * @param record - The conversation to save
 * @param options - Limit protection and the anti-resurrection check
 * @returns Whether the record was written, and what the limit evicted
 */
export async function saveConversation(
  record: ConversationRecord,
  options: SaveConversationOptions = {},
): Promise<SaveConversationResult> {
  const { protectedIds, expectPersisted = false } = options;
  const db = await getConversationDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const all = (await tx.store.getAll()) as ConversationRecord[];
  const exists = all.some((r) => r.id === record.id);

  if (expectPersisted && !exists) {
    await tx.done;

    return { deletedCount: 0, limitReached: false, saved: false };
  }

  const trim = selectLimitTrim(all, record.id, exists, protectedIds);

  for (const id of trim.ids) void tx.store.delete(id);

  void tx.store.put(record);
  await tx.done;

  return {
    deletedCount: trim.ids.length,
    limitReached: trim.limitReached,
    saved: true,
  };
}

/**
 * Load a single conversation by ID.
 * @param id - Conversation ID
 * @returns The conversation record, or undefined if not found
 */
export async function loadConversation(
  id: string,
): Promise<ConversationRecord | undefined> {
  const db = await getConversationDb();
  const raw = (await db.get(STORE_NAME, id)) as
    | Partial<ConversationRecord>
    | undefined;

  if (!raw) return undefined;

  return normalizeLegacyRecord(raw);
}

/**
 * Delete a conversation by ID.
 * @param id - Conversation ID to delete
 */
export async function deleteConversation(id: string): Promise<void> {
  const db = await getConversationDb();

  await db.delete(STORE_NAME, id);
}

/**
 * Delete all conversations.
 */
export async function deleteAllConversations(): Promise<void> {
  const db = await getConversationDb();

  await db.clear(STORE_NAME);
}

/**
 * Delete all unbookmarked conversations.
 */
export async function deleteUnbookmarkedConversations(): Promise<void> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as ConversationRecord[];
  const tx = db.transaction(STORE_NAME, "readwrite");

  for (const record of all) {
    if (!record.bookmarked) void tx.store.delete(record.id);
  }

  await tx.done;
}

/**
 * Rename a conversation.
 * @param id - Conversation ID
 * @param title - New title (null to clear)
 */
export async function renameConversation(
  id: string,
  title: string | null,
): Promise<void> {
  const db = await getConversationDb();
  const record = (await db.get(STORE_NAME, id)) as
    | ConversationRecord
    | undefined;

  if (!record) return;

  record.title = title;
  await db.put(STORE_NAME, record);
}

/**
 * Set the bookmarked state of a conversation.
 * @param id - Conversation ID
 * @param bookmarked - Whether to bookmark
 */
export async function setBookmark(
  id: string,
  bookmarked: boolean,
): Promise<void> {
  const db = await getConversationDb();
  const record = (await db.get(STORE_NAME, id)) as
    | ConversationRecord
    | undefined;

  if (!record) return;

  record.bookmarked = bookmarked;
  await db.put(STORE_NAME, record);
}

/**
 * List conversations for display, ordered by recency. Branch families (edit/retry
 * forks linked by {@link ConversationRecord.forkParentId}) are collapsed to a
 * single representative so forks don't clutter the list. The active conversation,
 * when passed, represents its family — so the sidebar can highlight the sibling
 * being viewed even if it isn't the most recent one. Use
 * {@link listAllConversationSummaries} when every sibling is needed (e.g.
 * branch-arrow navigation).
 * @param activeId - Active conversation id, promoted to represent its family
 * @returns Array of conversation summaries, one per branch family
 */
export async function listConversations(
  activeId?: string | null,
): Promise<ConversationSummary[]> {
  return collapseBranchFamilies(await listAllConversationSummaries(), activeId);
}

/**
 * List every conversation summary (no branch collapsing), sorted by updatedAt
 * descending. Branch-arrow navigation needs all siblings, not just the
 * collapsed representatives that {@link listConversations} returns.
 * @returns Array of all conversation summaries
 */
export async function listAllConversationSummaries(): Promise<
  ConversationSummary[]
> {
  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as Partial<ConversationRecord>[];

  return all
    .map(normalizeLegacyRecord)
    .map(
      ({
        id,
        title,
        createdAt,
        updatedAt,
        bookmarked,
        provider,
        model,
        modelLabel,
        thinking,
        smallModelMode,
        totalUsage,
        sessionType,
        forkParentId,
        forkedAtIndex,
      }) => ({
        id,
        title,
        createdAt,
        updatedAt,
        bookmarked,
        provider,
        model,
        modelLabel,
        thinking,
        smallModelMode,
        totalUsage,
        sessionType,
        // Only carried on forked records — kept off plain summaries so callers
        // (and equality assertions) see the unchanged shape for normal chats.
        ...(forkParentId != null && { forkParentId }),
        ...(forkedAtIndex != null && { forkedAtIndex }),
      }),
    )
    .toSorted((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Find conversations whose title, message text, or voice transcript contains
 * the query (case-insensitive substring). Scans full records because
 * transcripts are not carried by the summary list; the {@link MAX_CONVERSATIONS}
 * cap keeps this a cheap linear scan. Text records match on `messages`; voice
 * records keep their transcript in `voiceHistory`, so both are searched.
 * @param query - Search text; a blank/whitespace-only query matches nothing
 * @returns Set of matching conversation IDs
 */
export async function searchConversations(query: string): Promise<Set<string>> {
  const needle = query.trim().toLowerCase();
  const matches = new Set<string>();

  if (!needle) return matches;

  const db = await getConversationDb();
  const all = (await db.getAll(STORE_NAME)) as Partial<ConversationRecord>[];

  for (const raw of all) {
    const record = normalizeLegacyRecord(raw);
    // Guard the title type as well: a corrupt/imported record can carry a
    // non-string title despite the static type, and `title.toLowerCase()` would
    // throw, breaking search for the whole list.
    const inTitle =
      typeof record.title === "string" &&
      record.title.toLowerCase().includes(needle);
    // Cast to unknown per element: a corrupt/imported record can carry a
    // malformed message (null, or no string content) despite the static type,
    // and `m.content.toLowerCase()` would throw. Skip such entries.
    const inMessages = (record.messages as unknown[]).some((m) => {
      const content = (m as { content?: unknown } | null)?.content;

      return (
        typeof content === "string" && content.toLowerCase().includes(needle)
      );
    });
    const inVoice = extractVoiceTranscriptText(record.voiceHistory)
      .toLowerCase()
      .includes(needle);

    if (inTitle || inMessages || inVoice) matches.add(record.id);
  }

  return matches;
}

/**
 * Close the DB connection and reset the cached promise. Used in tests.
 */
export async function resetDbCache(): Promise<void> {
  const cached = dbPromise;

  dbPromise = null;

  if (cached) {
    const db = await cached;

    db.close();
  }
}

// --- Helpers below main exports ---

/**
 * Fill in fields missing from records written by earlier schema versions, so
 * the rest of the code can treat the result as a full {@link ConversationRecord}.
 * @param raw - Raw record from IndexedDB (possibly missing newer fields)
 * @returns Record with all fields populated to current shape
 */
function normalizeLegacyRecord(
  raw: Partial<ConversationRecord>,
): ConversationRecord {
  raw.thinking ??= null;
  raw.smallModelMode ??= null;
  raw.totalUsage ??= null;
  raw.sessionType ??= "text";
  raw.voiceHistory ??= null;
  // Voice records persist messages: [], but a corrupt/older record could lack
  // the field entirely; default it so callers (e.g. searchConversations) can
  // treat messages as a guaranteed array.
  raw.messages ??= [];

  return raw as ConversationRecord;
}

/**
 * Extract searchable text from a voice record's transcript history. Voice
 * conversations keep their spoken/typed text in `voiceHistory` (RealtimeItem[])
 * rather than `messages`, so this pulls the `text`/`transcript` strings out of
 * each user and assistant message item. Walks the structure defensively because
 * the storage layer keeps `voiceHistory` typed as `unknown[]` to stay decoupled
 * from @openai/agents/realtime. Mirrors `realtimeItemsToUIMessages`, including
 * its role filter — only `user`/`assistant` messages are searched, so search
 * never matches `system` text the transcript doesn't render. Keep the two in
 * sync if the item shape changes.
 * @param voiceHistory - Raw RealtimeItem list persisted on the record, or null
 * @returns All transcript text joined by spaces (empty string if none)
 */
function extractVoiceTranscriptText(voiceHistory: unknown[] | null): string {
  if (voiceHistory == null) return "";

  const parts: string[] = [];

  for (const item of voiceHistory) {
    if (!isRecord(item) || item.type !== "message") continue;
    // Only search what the transcript renders: `realtimeItemsToUIMessages`
    // skips system messages, so search must too (don't match hidden text).
    if (item.role !== "user" && item.role !== "assistant") continue;
    if (!Array.isArray(item.content)) continue;

    for (const part of item.content) {
      if (!isRecord(part)) continue;
      // input_text/output_text carry `.text`; audio items carry `.transcript`.
      const text = part.text ?? part.transcript;

      if (typeof text === "string" && text) parts.push(text);
    }
  }

  return parts.join(" ");
}

/**
 * Narrow an unknown value to a plain object for safe property access.
 * @param value - The value to test
 * @returns True if value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

/**
 * Pick the conversations the limit must evict to make room for a save: the
 * oldest unbookmarked, unprotected ones.
 * @param all - Every record currently in the store
 * @param excludeId - Id of the conversation being saved (never evicted)
 * @param exists - Whether that conversation is already among `all`
 * @param protectedIds - Additional ids excluded from eviction (e.g. an import batch)
 * @returns Ids to delete, and whether bookmarks consumed the slots we needed
 */
function selectLimitTrim(
  all: ConversationRecord[],
  excludeId: string,
  exists: boolean,
  protectedIds?: ReadonlySet<string>,
): { ids: string[]; limitReached: boolean } {
  // The record is about to be written, so count it whether or not it's there yet.
  const totalAfterSave = exists ? all.length : all.length + 1;

  if (totalAfterSave <= MAX_CONVERSATIONS) {
    return { ids: [], limitReached: false };
  }

  const excess = totalAfterSave - MAX_CONVERSATIONS;
  const ids = all
    .filter(
      (r) => !r.bookmarked && r.id !== excludeId && !protectedIds?.has(r.id),
    )
    .toSorted((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, excess)
    .map((r) => r.id);

  return { ids, limitReached: ids.length < excess };
}
