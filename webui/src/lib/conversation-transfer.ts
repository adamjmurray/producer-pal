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

/**
 * Import conversations from a JSON string, merging into the existing database.
 * Matching IDs overwrite existing records; new IDs are inserted.
 * @param json - JSON string in the export format
 * @returns Counts of new, updated, and skipped conversations
 */
export async function importConversations(
  json: string,
): Promise<{ newCount: number; updatedCount: number; skippedCount: number }> {
  const data = JSON.parse(json) as Record<string, unknown>;

  if (!Array.isArray(data.conversations)) {
    throw new Error("Invalid format: missing conversations array");
  }

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const raw of data.conversations as unknown[]) {
    const record = raw as Record<string, unknown>;

    if (!validateRecord(record)) {
      skippedCount++;
      continue;
    }

    try {
      const existing = await loadConversation(record.id as string);

      await saveConversation(normalizeRecord(record));

      if (existing) {
        updatedCount++;
      } else {
        newCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  return { newCount, updatedCount, skippedCount };
}

// --- Helpers below main exports ---

/**
 * Validate that a raw record has the minimum required fields.
 * @param record - Raw parsed object
 * @returns Whether the record is valid for import
 */
function validateRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "number" &&
    Array.isArray(record.messages)
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
    messages: record.messages as ConversationRecord["messages"],
  };
}
