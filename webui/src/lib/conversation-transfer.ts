// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isNotation } from "#src/shared/notation";
import {
  type BranchRecord,
  branchFamilyIds,
  forkPointerCreatesCycle,
} from "#webui/lib/conversation-branch-helpers";
import {
  type ConversationRecord,
  listAllConversationSummaries,
  loadConversation,
  saveConversation,
  getConversationDb,
} from "#webui/lib/conversation-db";

interface ExportData {
  version: 1;
  exportedAt: string;
  conversations: ConversationRecord[];
}

/**
 * Export a single conversation from IndexedDB as a JSON string.
 * @param id - Conversation ID to export
 * @returns JSON string and conversation title (null if untitled)
 */
export async function exportConversation(
  id: string,
): Promise<{ json: string; title: string | null }> {
  const record = await loadConversation(id);

  if (!record) throw new Error(`Conversation ${id} not found`);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: [record],
  };

  return { json: JSON.stringify(data, null, 2), title: record.title };
}

/**
 * Export all conversations from IndexedDB as a JSON string.
 * @returns JSON string and conversation count
 */
export async function exportConversations(): Promise<{
  json: string;
  count: number;
}> {
  const db = await getConversationDb();
  const all = (await db.getAll("conversations")) as ConversationRecord[];
  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: all,
  };

  return { json: JSON.stringify(data, null, 2), count: all.length };
}

export interface ImportResult {
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  ignoredCount: number;
}

/**
 * Import conversations from a JSON string, merging into the existing database.
 * Matching IDs overwrite existing records only if the imported version is newer.
 * New IDs are inserted. Older imported versions are ignored.
 * @param json - JSON string in the export format
 * @returns Counts of new, updated, skipped, and ignored conversations
 */
export async function importConversations(json: string): Promise<ImportResult> {
  const data = JSON.parse(json) as Record<string, unknown>;

  if (!Array.isArray(data.conversations)) {
    throw new Error("Invalid format: missing conversations array");
  }

  // Protect every conversation in this import from the per-save limit trim, so
  // saving one imported record can't delete another just-imported record that
  // carries an older timestamp (imported records keep their original updatedAt).
  const importIds = new Set(
    (data.conversations as unknown[])
      .map((r) => (r as Record<string, unknown>).id)
      .filter((id): id is string => typeof id === "string"),
  );

  // Extend that protection to the whole branch family each imported fork joins,
  // including pre-existing local trunks/siblings. Otherwise importing a fork
  // whose trunk already exists locally (old and unbookmarked) could let the
  // per-save trim evict that trunk — losing its transcript and orphaning the
  // imported branch's ‹ n/m › navigation. The walk needs both the imported
  // records (for their parent pointers) and the existing summaries.
  const importedBranchRecords: BranchRecord[] = (
    data.conversations as unknown[]
  )
    .map((r) => r as Record<string, unknown>)
    .filter((r) => typeof r.id === "string")
    .map((r) => ({
      id: r.id as string,
      createdAt: (r.createdAt as number | undefined) ?? 0,
      updatedAt: (r.updatedAt as number | undefined) ?? 0,
      ...(typeof r.forkParentId === "string" && {
        forkParentId: r.forkParentId,
      }),
      ...(typeof r.forkedAtIndex === "number" && {
        forkedAtIndex: r.forkedAtIndex,
      }),
    }));
  const existingSummaries = await listAllConversationSummaries();
  const protectedIds = branchFamilyIds(
    [...importIds],
    [...existingSummaries, ...importedBranchRecords],
  );

  // Combined parent graph (imported pointers win over existing for the same id)
  // used to reject a fork pointer that would make a record its own ancestor.
  // branchRootId tolerates such a cycle without looping, but it still splits one
  // family across roots and breaks the ‹ n/m › arrows, so drop those pointers.
  const parentOf = new Map<string, string | undefined>();

  for (const r of existingSummaries) parentOf.set(r.id, r.forkParentId);
  for (const r of importedBranchRecords) parentOf.set(r.id, r.forkParentId);

  const cyclicForkIds = new Set(
    importedBranchRecords
      .filter(
        (r) =>
          r.forkParentId != null &&
          forkPointerCreatesCycle(r.id, r.forkParentId, parentOf),
      )
      .map((r) => r.id),
  );

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let ignoredCount = 0;

  for (const raw of data.conversations as unknown[]) {
    const record = raw as Record<string, unknown>;

    if (!validateRecord(record)) {
      skippedCount++;
      continue;
    }

    try {
      const normalized = normalizeRecord(
        record,
        cyclicForkIds.has(record.id as string),
      );
      const existing = await loadConversation(normalized.id);

      if (existing && existing.updatedAt >= normalized.updatedAt) {
        ignoredCount++;
        continue;
      }

      await saveConversation(normalized, protectedIds);

      if (existing) {
        updatedCount++;
      } else {
        newCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  return { newCount, updatedCount, skippedCount, ignoredCount };
}

// --- Helpers below main exports ---

/**
 * Validate that a raw record has the minimum required fields and something
 * worth importing. A record with a mix of good and malformed messages is still
 * valid — the bad ones are dropped in {@link normalizeRecord} rather than the
 * whole conversation being discarded — but one whose messages are *all*
 * malformed has nothing to keep and is skipped.
 * @param record - Raw parsed object
 * @returns Whether the record is valid for import
 */
function validateRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "number" &&
    Array.isArray(record.messages) &&
    hasUsableMessages(record.messages)
  );
}

/**
 * Whether a record's messages are worth importing: either intentionally empty
 * (voice records store their transcript in voiceHistory) or carrying at least
 * one valid message. A record with no usable message is dropped wholesale.
 * @param messages - Raw parsed messages array
 * @returns Whether the record has importable messages
 */
function hasUsableMessages(messages: unknown[]): boolean {
  return messages.length === 0 || messages.some(isValidImportedMessage);
}

/**
 * Validate a single imported message has the minimum shape search relies on.
 * Without this, a message lacking a string `content` is saved and later crashes
 * `searchConversations` (`m.content.toLowerCase()`). Used both to gate a record
 * (see {@link hasUsableMessages}) and to filter individual bad messages out of
 * an otherwise-usable record in {@link normalizeRecord}.
 * @param message - Raw parsed message element
 * @returns Whether the message has a string content field
 */
function isValidImportedMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { content?: unknown }).content === "string"
  );
}

/**
 * Normalize a raw record into a full ConversationRecord with defaults.
 * @param record - Raw parsed object with validated required fields
 * @param dropForkPointers - Drop forkParentId/forkedAtIndex (the import detected
 *   they would make this record its own ancestor — see {@link forkPointerCreatesCycle})
 * @returns Normalized conversation record
 */
function normalizeRecord(
  record: Record<string, unknown>,
  dropForkPointers = false,
): ConversationRecord {
  return {
    id: record.id as string,
    // Coerce a non-string title to null: search does `title.toLowerCase()`, so a
    // numeric/object title (from a hand-edited or corrupt import) would otherwise
    // be persisted and crash searchConversations for the whole list.
    title: typeof record.title === "string" ? record.title : null,
    createdAt: record.createdAt as number,
    updatedAt:
      (record.updatedAt as number | undefined) ?? (record.createdAt as number),
    bookmarked: (record.bookmarked as boolean | undefined) ?? false,
    provider: (record.provider as string | null | undefined) ?? null,
    model: (record.model as string | null | undefined) ?? null,
    modelLabel: (record.modelLabel as string | null | undefined) ?? null,
    thinking: (record.thinking as string | null | undefined) ?? null,
    smallModelMode:
      (record.smallModelMode as boolean | null | undefined) ?? null,
    totalUsage:
      (record.totalUsage as ConversationRecord["totalUsage"] | undefined) ??
      null,
    sessionType:
      (record.sessionType as ConversationRecord["sessionType"] | undefined) ??
      "text",
    // Drop any individually malformed messages (validateRecord already ensured
    // at least one survives, or the array was intentionally empty) so one bad
    // entry can't strand the rest of the conversation.
    messages: (record.messages as unknown[]).filter(
      isValidImportedMessage,
    ) as ConversationRecord["messages"],
    voiceHistory:
      (record.voiceHistory as ConversationRecord["voiceHistory"] | undefined) ??
      null,
    // Round-trip the system-prompt snapshot so an imported conversation still
    // shows what it ran with. Optional: only carried when present and a string.
    ...(typeof record.systemInstruction === "string" && {
      systemInstruction: record.systemInstruction,
    }),
    // Round-trip the notation snapshot too, so continuing an imported
    // conversation reads its notes the way they were written. Guarded by
    // isNotation, not a bare typeof: an unknown notation string would be
    // sent as a header the server can't resolve.
    ...(isNotation(record.notation) && { notation: record.notation }),
    // Round-trip the branching pointers so exported fork families re-import as a
    // linked set. Both are optional; only carry them when present and well-typed
    // so a plain (non-forked) record keeps its shape. Dropped entirely when the
    // pointer would make this record its own ancestor (a corrupt/hand-edited
    // cycle), so the family collapses cleanly instead of splitting across roots.
    ...(!dropForkPointers &&
      typeof record.forkParentId === "string" && {
        forkParentId: record.forkParentId,
      }),
    ...(!dropForkPointers &&
      typeof record.forkedAtIndex === "number" && {
        forkedAtIndex: record.forkedAtIndex,
      }),
  };
}
