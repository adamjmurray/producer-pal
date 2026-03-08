// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type ConversationRecord,
  deleteConversation,
  getConversationDb,
  listConversations,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "./conversation-db";

function createRecord(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [{ role: "user", content: "hello" }],
    ...overrides,
  };
}

describe("conversation-db", () => {
  beforeEach(async () => {
    resetDbCache();
    const db = await getConversationDb();

    await db.clear("conversations");
  });

  it("saves and loads a conversation", async () => {
    const record = createRecord();

    await saveConversation(record);
    const loaded = await loadConversation(record.id);

    expect(loaded).toStrictEqual(record);
  });

  it("returns undefined for nonexistent conversation", async () => {
    const loaded = await loadConversation("nonexistent-id");

    expect(loaded).toBeUndefined();
  });

  it("updates an existing conversation on re-save", async () => {
    const record = createRecord();

    await saveConversation(record);

    const updated = {
      ...record,
      updatedAt: record.updatedAt + 1000,
      messages: [
        { role: "user" as const, content: "hello" },
        { role: "assistant" as const, content: "hi there" },
      ],
    };

    await saveConversation(updated);
    const loaded = await loadConversation(record.id);

    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.updatedAt).toBe(updated.updatedAt);
  });

  it("lists conversations sorted by createdAt descending", async () => {
    const older = createRecord({ createdAt: 1000 });
    const newer = createRecord({ createdAt: 2000 });
    const middle = createRecord({ createdAt: 1500 });

    await saveConversation(older);
    await saveConversation(newer);
    await saveConversation(middle);

    const list = await listConversations();

    expect(list).toHaveLength(3);
    expect(list[0]?.id).toBe(newer.id);
    expect(list[1]?.id).toBe(middle.id);
    expect(list[2]?.id).toBe(older.id);
  });

  it("list summaries exclude messages", async () => {
    const record = createRecord();

    await saveConversation(record);

    const list = await listConversations();

    expect(list[0]).toStrictEqual({
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    expect(
      (list[0] as unknown as Record<string, unknown>).messages,
    ).toBeUndefined();
  });

  it("deletes a conversation by ID", async () => {
    const record = createRecord();

    await saveConversation(record);
    await deleteConversation(record.id);
    const loaded = await loadConversation(record.id);

    expect(loaded).toBeUndefined();
  });

  it("returns empty list when no conversations exist", async () => {
    const list = await listConversations();

    expect(list).toStrictEqual([]);
  });
});
