// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CONVERSATIONS,
  deleteConversation,
  getConversationDb,
  listConversations,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

describe("saveConversation expectPersisted guard", () => {
  beforeEach(async () => {
    await resetDbCache();

    const db = await getConversationDb();

    await db.clear("conversations");
  });

  it("refuses to resurrect a deleted record", async () => {
    const record = createTestRecord();

    await saveConversation(record);
    await deleteConversation(record.id);

    const result = await saveConversation(
      { ...record, title: "later autosave" },
      { expectPersisted: true },
    );

    expect(result.saved).toBe(false);
    expect(await loadConversation(record.id)).toBeUndefined();
  });

  it("writes when the record is still there", async () => {
    const record = createTestRecord();

    await saveConversation(record);

    const result = await saveConversation(
      { ...record, title: "renamed" },
      { expectPersisted: true },
    );

    const stored = await loadConversation(record.id);

    expect(result.saved).toBe(true);
    expect(stored?.title).toBe("renamed");
  });

  it("writes a first save even though no row exists yet", async () => {
    const record = createTestRecord();
    const result = await saveConversation(record, { expectPersisted: false });

    expect(result.saved).toBe(true);
    expect(await loadConversation(record.id)).toBeDefined();
  });

  it("heals itself when the record legitimately comes back", async () => {
    // Undo and import both restore a record under its original id. A tombstone
    // set has to be told; reading the store finds out on its own.
    const record = createTestRecord();

    await saveConversation(record);
    await deleteConversation(record.id);
    await saveConversation(record); // undo/import restores it

    const result = await saveConversation(
      { ...record, title: "autosave after restore" },
      { expectPersisted: true },
    );

    const stored = await loadConversation(record.id);

    expect(result.saved).toBe(true);
    expect(stored?.title).toBe("autosave after restore");
  });

  it("evicts nothing when the guard rejects the write", async () => {
    const victim = createTestRecord({ updatedAt: 1 });

    await saveConversation(victim);

    for (let i = 1; i < MAX_CONVERSATIONS - 1; i++) {
      await saveConversation(createTestRecord({ updatedAt: 1000 + i }));
    }

    const deleted = createTestRecord({ updatedAt: 99999 });

    await saveConversation(deleted);
    await deleteConversation(deleted.id);

    // Writing this record back would put the store over the limit and evict the
    // oldest. Getting refused must not trim on the way out.
    const result = await saveConversation(deleted, { expectPersisted: true });

    expect(result).toStrictEqual({
      deletedCount: 0,
      limitReached: false,
      saved: false,
    });
    expect(await loadConversation(victim.id)).toBeDefined();
    expect(await listConversations()).toHaveLength(MAX_CONVERSATIONS - 1);
  });
});
