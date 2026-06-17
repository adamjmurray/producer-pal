// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ConversationRecord,
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
      const normalized = normalizeRecord(record);
      const existing = await loadConversation(normalized.id);

      if (existing && existing.updatedAt >= normalized.updatedAt) {
        ignoredCount++;
        continue;
      }

      await saveConversation(normalized, importIds);

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
 * @returns Normalized conversation record
 */
function normalizeRecord(record: Record<string, unknown>): ConversationRecord {
  return {
    id: record.id as string,
    title: (record.title as string | null | undefined) ?? null,
    createdAt: record.createdAt as number,
    updatedAt:
      (record.updatedAt as number | undefined) ?? (record.createdAt as number),
    bookmarked: (record.bookmarked as boolean | undefined) ?? false,
    provider: (record.provider as string | null | undefined) ?? null,
    model: (record.model as string | null | undefined) ?? null,
    modelLabel: (record.modelLabel as string | null | undefined) ?? null,
    thinking: (record.thinking as string | null | undefined) ?? null,
    temperature: (record.temperature as number | null | undefined) ?? null,
    showThoughts: (record.showThoughts as boolean | null | undefined) ?? null,
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
    // Round-trip the branching pointers so exported fork families re-import as a
    // linked set. Both are optional; only carry them when present and well-typed
    // so a plain (non-forked) record keeps its shape.
    ...(typeof record.forkParentId === "string" && {
      forkParentId: record.forkParentId,
    }),
    ...(typeof record.forkedAtIndex === "number" && {
      forkedAtIndex: record.forkedAtIndex,
    }),
  };
}
