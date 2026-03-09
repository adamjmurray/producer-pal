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
  renameConversation,
  resetDbCache,
  saveConversation,
  setBookmark,
} from "./conversation-db";

function createRecord(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id: crypto.randomUUID(),
    title: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookmarked: false,
    provider: null,
    model: null,
    modelLabel: null,
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
      title: null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      bookmarked: false,
      provider: null,
      model: null,
      modelLabel: null,
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

  it("renames a conversation", async () => {
    const record = createRecord();

    await saveConversation(record);
    await renameConversation(record.id, "New title");
    const loaded = await loadConversation(record.id);

    expect(loaded?.title).toBe("New title");
  });

  it("rename is a no-op for nonexistent conversation", async () => {
    await renameConversation("nonexistent", "Title");
    const loaded = await loadConversation("nonexistent");

    expect(loaded).toBeUndefined();
  });

  it("returns empty list when no conversations exist", async () => {
    const list = await listConversations();

    expect(list).toStrictEqual([]);
  });

  it("setBookmark sets and unsets bookmarked flag", async () => {
    const record = createRecord();

    await saveConversation(record);
    await setBookmark(record.id, true);
    let loaded = await loadConversation(record.id);

    expect(loaded?.bookmarked).toBe(true);

    await setBookmark(record.id, false);
    loaded = await loadConversation(record.id);

    expect(loaded?.bookmarked).toBe(false);
  });

  it("setBookmark is a no-op for nonexistent conversation", async () => {
    await setBookmark("nonexistent", true);
    const loaded = await loadConversation("nonexistent");

    expect(loaded).toBeUndefined();
  });

  it("includes modelLabel in saved and listed conversations", async () => {
    const record = createRecord({
      model: "test-model",
      modelLabel: "Test Model Label",
    });

    await saveConversation(record);
    const loaded = await loadConversation(record.id);

    expect(loaded?.modelLabel).toBe("Test Model Label");

    const list = await listConversations();

    expect(list[0]?.modelLabel).toBe("Test Model Label");
  });

  it("defaults modelLabel to null for records without it", async () => {
    const db = await getConversationDb();

    // Simulate a pre-v4 record missing modelLabel
    await db.put("conversations", {
      id: "legacy-record",
      title: null,
      createdAt: 1000,
      updatedAt: 1000,
      bookmarked: false,
      provider: null,
      model: "old-model",
      messages: [],
    });

    const list = await listConversations();
    const legacy = list.find((c) => c.id === "legacy-record");

    expect(legacy?.modelLabel).toBeNull();
  });

  it("sorts all conversations by createdAt desc regardless of bookmark", async () => {
    const oldest = createRecord({ createdAt: 1000 });
    const middle = createRecord({ createdAt: 2000 });
    const newest = createRecord({ createdAt: 3000 });

    await saveConversation(oldest);
    await saveConversation(middle);
    await saveConversation(newest);
    await setBookmark(oldest.id, true);

    const list = await listConversations();

    expect(list[0]?.id).toBe(newest.id);
    expect(list[1]?.id).toBe(middle.id);
    expect(list[2]?.id).toBe(oldest.id);
    expect(list[2]?.bookmarked).toBe(true);
  });
});
