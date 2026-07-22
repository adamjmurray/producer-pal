// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { branchFamilyIds } from "#webui/lib/conversation-branch-helpers";
import {
  type ConversationRecord,
  MAX_CONVERSATIONS,
  deleteAllConversations,
  deleteConversation,
  deleteUnbookmarkedConversations,
  getConversationDb,
  listConversations,
  loadConversation,
  renameConversation,
  resetDbCache,
  saveConversation,
  searchConversations,
  setBookmark,
} from "#webui/lib/conversation-db";
import { createTestRecord as createRecord } from "#webui/test-utils/conversation-test-helpers";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

const DB_NAME = "producer-pal-conversations";

/**
 * Restore mocked globals and delete the DB so each test starts from scratch,
 * with no version mismatch or cached connection left over from a prior test.
 */
async function resetMocksAndDeleteDb(): Promise<void> {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- restoreAllMocks removes the spy, leaving confirm undefined at runtime
  window.confirm ??= () => false;
  // resetDbCache may throw if a prior test left a rejected dbPromise
  await resetDbCache().catch(() => {});
  await deleteIndexedDb(DB_NAME);
}

describe("conversation-db", () => {
  beforeEach(async () => {
    await resetDbCache();

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

  it("lists conversations sorted by updatedAt descending", async () => {
    const older = createRecord({ updatedAt: 1000 });
    const newer = createRecord({ updatedAt: 2000 });
    const middle = createRecord({ updatedAt: 1500 });

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
      thinking: null,
      temperature: null,
      showThoughts: null,
      smallModelMode: null,
      totalUsage: null,
      sessionType: "text",
    });
    expect(
      (list[0] as unknown as Record<string, unknown>).messages,
    ).toBeUndefined();
  });

  it("deletes all conversations", async () => {
    await saveConversation(createRecord());
    await saveConversation(createRecord());
    await saveConversation(createRecord());

    await deleteAllConversations();
    const list = await listConversations();

    expect(list).toHaveLength(0);
  });

  it("deletes only unbookmarked conversations", async () => {
    const bookmarked = createRecord({ bookmarked: true });
    const unbookmarked1 = createRecord();
    const unbookmarked2 = createRecord();

    await saveConversation(bookmarked);
    await saveConversation(unbookmarked1);
    await saveConversation(unbookmarked2);

    await deleteUnbookmarkedConversations();
    const list = await listConversations();

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(bookmarked.id);
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

  /**
   * Save a record, then strip the named fields from the stored entry to
   * simulate a legacy DB entry written by an older build.
   * @param fields - Names of the fields to remove from the stored entry
   * @param overrides - Fields to override on the record before saving
   * @returns The saved record, as it was before the fields were stripped
   */
  async function saveRecordWithoutFields(
    fields: string[],
    overrides: Partial<ConversationRecord> = {},
  ): Promise<ConversationRecord> {
    const record = createRecord(overrides);

    await saveConversation(record);

    const db = await getConversationDb();
    const raw = await db.get("conversations", record.id);

    for (const field of fields) {
      delete (raw as Record<string, unknown>)[field];
    }

    await db.put("conversations", raw);

    return record;
  }

  /**
   * Save a record missing every optional settings field older builds never
   * wrote, to simulate a legacy DB entry.
   * @returns The saved record
   */
  async function saveRecordWithMissingFields(): Promise<ConversationRecord> {
    return await saveRecordWithoutFields([
      "thinking",
      "temperature",
      "showThoughts",
      "smallModelMode",
    ]);
  }

  it("defaults missing thinking/temperature/showThoughts to null on load", async () => {
    const record = await saveRecordWithMissingFields();
    const loaded = await loadConversation(record.id);

    expect(loaded?.thinking).toBeNull();
    expect(loaded?.temperature).toBeNull();
    expect(loaded?.showThoughts).toBeNull();
    expect(loaded?.smallModelMode).toBeNull();
  });

  it("defaults missing sessionType to 'text' and voiceHistory to null on load", async () => {
    const record = await saveRecordWithoutFields([
      "sessionType",
      "voiceHistory",
    ]);
    const loaded = await loadConversation(record.id);

    expect(loaded?.sessionType).toBe("text");
    expect(loaded?.voiceHistory).toBeNull();
  });

  it("defaults missing sessionType to 'text' in list summaries", async () => {
    await saveRecordWithoutFields(["sessionType"]);

    const list = await listConversations();

    expect(list[0]?.sessionType).toBe("text");
  });

  it("preserves voice sessionType and voiceHistory through save/load", async () => {
    const record = createRecord({
      sessionType: "voice",
      voiceHistory: [{ type: "message", role: "user", content: [] }],
      messages: [],
    });

    await saveConversation(record);
    const loaded = await loadConversation(record.id);

    expect(loaded?.sessionType).toBe("voice");
    expect(loaded?.voiceHistory).toStrictEqual([
      { type: "message", role: "user", content: [] },
    ]);

    const list = await listConversations();

    expect(list[0]?.sessionType).toBe("voice");
  });

  it("defaults missing fields to null in list summaries", async () => {
    await saveRecordWithMissingFields();
    const list = await listConversations();

    expect(list[0]?.thinking).toBeNull();
    expect(list[0]?.temperature).toBeNull();
    expect(list[0]?.showThoughts).toBeNull();
    expect(list[0]?.smallModelMode).toBeNull();
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

  it("searchConversations matches on title", async () => {
    const a = createRecord({ title: "Drum patterns", messages: [] });
    const b = createRecord({ title: "Bass line", messages: [] });

    await saveConversation(a);
    await saveConversation(b);

    const matches = await searchConversations("drum");

    expect(matches.has(a.id)).toBe(true);
    expect(matches.has(b.id)).toBe(false);
  });

  it("searchConversations matches on message content", async () => {
    const a = createRecord({
      messages: [
        { role: "user", content: "make a syncopated groove" },
        { role: "assistant", content: "done" },
      ],
    });
    const b = createRecord({
      messages: [{ role: "user", content: "transpose up an octave" }],
    });

    await saveConversation(a);
    await saveConversation(b);

    const matches = await searchConversations("syncopated");

    expect(matches.has(a.id)).toBe(true);
    expect(matches.has(b.id)).toBe(false);
  });

  it("searchConversations tolerates a message lacking string content (no crash)", async () => {
    // A corrupt record (older build / direct DB write) whose message has no
    // string content must be skipped by search, not throw on
    // m.content.toLowerCase().
    const corrupt = createRecord({
      // an object without string content, and a null element
      messages: [
        { role: "user" },
        null,
      ] as unknown as ConversationRecord["messages"],
    });

    await saveConversation(corrupt);

    await expect(searchConversations("anything")).resolves.toBeInstanceOf(Set);
  });

  it("searchConversations matches on voice transcript text", async () => {
    const voice = createRecord({
      sessionType: "voice",
      messages: [],
      voiceHistory: [
        // Malformed entries are tolerated (voiceHistory is unknown[]): a
        // non-object item, a tool call, and a message with non-array content
        // are all skipped without throwing.
        null,
        { type: "function_call", name: "ppal-create-clip", arguments: "{}" },
        { type: "message", role: "system", content: "not-an-array" },
        // A system message IS skipped even with valid array content: search
        // mirrors the transcript, which doesn't render system text.
        {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: "supercalifragilistic" }],
        },
        {
          type: "message",
          role: "user",
          content: [
            "not-an-object",
            { type: "input_text" }, // no text/transcript yet
            { type: "input_audio", transcript: "play a shuffle beat" },
          ],
        },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_audio", transcript: "here you go" }],
        },
      ],
    });
    const other = createRecord({
      sessionType: "voice",
      messages: [],
      voiceHistory: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "make it louder" }],
        },
      ],
    });

    await saveConversation(voice);
    await saveConversation(other);

    const matches = await searchConversations("shuffle");

    expect(matches.has(voice.id)).toBe(true);
    expect(matches.has(other.id)).toBe(false);

    // Typed voice input (input_text) is searchable too.
    const typed = await searchConversations("louder");

    expect(typed.has(other.id)).toBe(true);

    // System-message text is NOT searchable (it isn't rendered in the transcript).
    const system = await searchConversations("supercalifragilistic");

    expect(system.has(voice.id)).toBe(false);
  });

  it("searchConversations handles records missing the messages field", async () => {
    const record = await saveRecordWithoutFields(["messages"], {
      title: "Legacy convo",
    });

    // Must not throw on the absent messages array; title search still matches.
    const matches = await searchConversations("legacy");

    expect(matches.has(record.id)).toBe(true);

    const loaded = await loadConversation(record.id);

    expect(loaded?.messages).toStrictEqual([]);
  });

  it("searchConversations is case-insensitive", async () => {
    const record = createRecord({ title: "MixDown Session", messages: [] });

    await saveConversation(record);

    const matches = await searchConversations("mixdown");

    expect(matches.has(record.id)).toBe(true);
  });

  it("searchConversations returns empty set for a blank query", async () => {
    await saveConversation(createRecord({ title: "Anything" }));

    expect(await searchConversations("")).toStrictEqual(new Set());
    expect(await searchConversations("   ")).toStrictEqual(new Set());
  });

  it("searchConversations returns empty set when nothing matches", async () => {
    await saveConversation(createRecord({ title: "Hello", messages: [] }));

    const matches = await searchConversations("no-such-text");

    expect(matches.size).toBe(0);
  });

  it("sorts all conversations by updatedAt desc regardless of bookmark", async () => {
    const oldest = createRecord({ updatedAt: 1000 });
    const middle = createRecord({ updatedAt: 2000 });
    const newest = createRecord({ updatedAt: 3000 });

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

describe("version mismatch recovery", () => {
  beforeEach(async () => {
    await resetMocksAndDeleteDb();
  });

  /** Create a DB at a higher version to simulate a downgrade scenario. */
  async function createHigherVersionDb(): Promise<void> {
    const record = createRecord({ id: "saved-convo", title: "Important" });

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 99);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("conversations")) {
          const store = db.createObjectStore("conversations", {
            keyPath: "id",
          });

          store.createIndex("updatedAt", "updatedAt");
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("conversations", "readwrite");

        tx.objectStore("conversations").put(record);

        tx.oncomplete = () => {
          db.close();
          resolve();
        };

        tx.onerror = () => reject(tx.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  it("exports and resets DB when user confirms both", async () => {
    await createHigherVersionDb();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const clickSpy = vi.fn();

    vi.spyOn(document, "createElement").mockReturnValue({
      set href(_v: string) {},
      set download(_v: string) {},
      click: clickSpy,
    } as unknown as HTMLElement);

    const db = await getConversationDb();

    expect(db).toBeDefined();
    // Verify file download was triggered
    expect(clickSpy).toHaveBeenCalled();

    // Verify DB was reset (empty)
    const list = await listConversations();

    expect(list).toHaveLength(0);
  });

  it("resets DB without export when user skips export", async () => {
    await createHigherVersionDb();

    vi.spyOn(window, "confirm")
      .mockReturnValueOnce(false) // skip export
      .mockReturnValueOnce(true); // confirm delete

    const db = await getConversationDb();

    expect(db).toBeDefined();

    const list = await listConversations();

    expect(list).toHaveLength(0);
  });

  it("throws when user cancels delete", async () => {
    await createHigherVersionDb();

    vi.spyOn(window, "confirm")
      .mockReturnValueOnce(false) // skip export
      .mockReturnValueOnce(false); // cancel delete

    await expect(getConversationDb()).rejects.toThrow(
      "Database version mismatch",
    );
  });
});

describe("conversation limit enforcement", () => {
  beforeEach(async () => {
    await resetMocksAndDeleteDb();

    const db = await getConversationDb();

    await db.clear("conversations");
  });

  /**
   * Save records with increasing updatedAt until the DB holds
   * MAX_CONVERSATIONS of them, so the next save must trim.
   * @param startIndex - Index to start filling from, when the caller has
   * already saved the earlier records itself
   * @returns The records saved here, oldest first
   */
  async function fillToLimit(startIndex = 0): Promise<ConversationRecord[]> {
    const records: ConversationRecord[] = [];

    for (let i = startIndex; i < MAX_CONVERSATIONS; i++) {
      const record = createRecord({ updatedAt: 1000 + i });

      records.push(record);
      await saveConversation(record);
    }

    return records;
  }

  it("does nothing when under the limit", async () => {
    const record = createRecord();
    const result = await saveConversation(record);

    expect(result).toStrictEqual({ deletedCount: 0, limitReached: false });

    const list = await listConversations();

    expect(list).toHaveLength(1);
  });

  it("deletes oldest non-bookmarked conversations when over limit", async () => {
    const records = await fillToLimit();

    // Save one more — should delete the oldest
    const newest = createRecord({ updatedAt: 99999 });
    const result = await saveConversation(newest);

    expect(result.deletedCount).toBe(1);
    expect(result.limitReached).toBe(false);

    const list = await listConversations();

    expect(list).toHaveLength(MAX_CONVERSATIONS);
    // The oldest (updatedAt: 1000) should have been deleted
    expect(list.find((c) => c.id === records[0]?.id)).toBeUndefined();
    // The newest should exist
    expect(list.find((c) => c.id === newest.id)).toBeDefined();
  });

  it("does not trim a protected id, deleting the next-oldest instead (#44)", async () => {
    // An import batch protects every imported record from the per-save trim, so
    // saving one imported record can't delete another. Fill to the limit, then
    // save one more while protecting the OLDEST record: it survives and the
    // next-oldest is trimmed instead.
    const records = await fillToLimit();
    const oldest = records[0]!;
    const nextOldest = records[1]!;
    const newest = createRecord({ updatedAt: 99999 });
    const result = await saveConversation(newest, new Set([oldest.id]));

    expect(result.deletedCount).toBe(1);
    expect(await loadConversation(oldest.id)).toBeDefined(); // protected → kept
    expect(await loadConversation(nextOldest.id)).toBeUndefined(); // trimmed
    expect(await loadConversation(newest.id)).toBeDefined();
  });

  it("shields a whole branch family so saving a new sibling can't evict an old one", async () => {
    // A fork save protects its family via branchFamilyIds. Make the family's
    // siblings the OLDEST records so they'd be trimmed first, then save a new
    // sibling at the cap: the family survives and an unrelated record is trimmed.
    const trunk = createRecord({ updatedAt: 100 });
    const oldSibling = createRecord({
      updatedAt: 101,
      forkParentId: trunk.id,
      forkedAtIndex: 1,
    });

    await saveConversation(trunk);
    await saveConversation(oldSibling);

    const filler = await fillToLimit(2);

    // New sibling forked off the same trunk — protect the family it joins.
    const newSibling = createRecord({
      updatedAt: 99999,
      forkParentId: trunk.id,
      forkedAtIndex: 1,
    });
    const protectedIds = branchFamilyIds(
      [trunk.id],
      [trunk, oldSibling, newSibling, ...filler],
    );
    const result = await saveConversation(newSibling, protectedIds);

    expect(result.deletedCount).toBe(1);
    // The family's old members survived despite being the oldest records...
    expect(await loadConversation(trunk.id)).toBeDefined();
    expect(await loadConversation(oldSibling.id)).toBeDefined();
    // ...and an unrelated filler record was trimmed instead.
    expect(await loadConversation(filler[0]!.id)).toBeUndefined();
  });

  it("skips bookmarked conversations during deletion", async () => {
    // Fill to limit with the oldest being bookmarked
    const bookmarked = createRecord({ updatedAt: 100, bookmarked: true });

    await saveConversation(bookmarked);

    for (let i = 1; i < MAX_CONVERSATIONS; i++) {
      await saveConversation(createRecord({ updatedAt: 1000 + i }));
    }

    // Save one more — should delete oldest non-bookmarked, not the bookmarked one
    const result = await saveConversation(createRecord({ updatedAt: 99999 }));

    expect(result.deletedCount).toBe(1);

    const loaded = await loadConversation(bookmarked.id);

    expect(loaded).toBeDefined();
    expect(loaded?.bookmarked).toBe(true);
  });

  it("returns limitReached when all conversations are bookmarked", async () => {
    // Fill to limit, all bookmarked
    for (let i = 0; i < MAX_CONVERSATIONS; i++) {
      await saveConversation(
        createRecord({ updatedAt: 1000 + i, bookmarked: true }),
      );
    }

    const result = await saveConversation(createRecord({ updatedAt: 99999 }));

    expect(result.limitReached).toBe(true);
    // Still saved (total is now MAX + 1)
    const list = await listConversations();

    expect(list).toHaveLength(MAX_CONVERSATIONS + 1);
  });

  it("does not delete the conversation being saved", async () => {
    // Fill to limit
    for (let i = 0; i < MAX_CONVERSATIONS; i++) {
      await saveConversation(createRecord({ updatedAt: 1000 + i }));
    }

    // Re-save an existing conversation (update) — should not delete itself
    const allConvos = await listConversations();
    const existing = allConvos.at(-1);
    const updated = createRecord({
      id: existing?.id,
      updatedAt: 500, // oldest updatedAt, but it's the one being saved
    });
    const result = await saveConversation(updated);

    expect(result.deletedCount).toBe(0);

    const loaded = await loadConversation(updated.id);

    expect(loaded).toBeDefined();
  });
});
