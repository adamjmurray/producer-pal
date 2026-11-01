// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatImage } from "#webui/chat/sdk/types";
import {
  type ConversationRecord,
  deleteAllConversations,
  deleteConversation,
  deleteUnbookmarkedConversations,
  getConversationDb,
  loadAllConversations,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

const DB_NAME = "producer-pal-conversations";
const PNG: ChatImage = { mediaType: "image/png", data: "iVBORw0KGgo=" };
const JPEG: ChatImage = { mediaType: "image/jpeg", data: "/9j/4AAQSkZJRg==" };

/**
 * A record whose first user message carries the given images.
 * @param id - Record id
 * @param images - Attached images
 * @param overrides - Other fields
 * @returns The record
 */
function withImages(
  id: string,
  images: ChatImage[],
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return createTestRecord({
    id,
    messages: [
      { role: "user", content: "match this", images },
      { role: "assistant", content: "ok" },
    ],
    ...overrides,
  });
}

/**
 * The images on a stored record's first message.
 * @param id - Record id
 * @returns Its images
 */
async function imagesOf(id: string): Promise<ChatImage[] | undefined> {
  const record = await loadConversation(id);

  return record?.messages[0]?.images;
}

/**
 * Keys in the image store.
 * @returns Stored image keys
 */
async function storedImageKeys(): Promise<IDBValidKey[]> {
  const db = await getConversationDb();

  return await db.getAllKeys("images");
}

/**
 * Write a record straight to the conversation store, bypassing the image store.
 * @param record - Raw record
 */
async function putRaw(record: unknown): Promise<void> {
  const db = await getConversationDb();

  await db.put("conversations", record);
}

describe("conversation images", () => {
  beforeEach(async () => {
    await resetDbCache();
    await deleteIndexedDb(DB_NAME);
  });

  it("stores one copy of an image shared by a fork", async () => {
    await saveConversation(withImages("trunk", [PNG]));
    await saveConversation(
      withImages("fork", [PNG], { forkParentId: "trunk", forkedAtIndex: 0 }),
    );

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("trunk")).toStrictEqual([PNG]);
    expect(await imagesOf("fork")).toStrictEqual([PNG]);
  });

  it("keeps the bytes out of the stored record", async () => {
    await saveConversation(withImages("a", [PNG]));

    const db = await getConversationDb();
    const raw: unknown = await db.get("conversations", "a");

    expect(JSON.stringify(raw)).not.toContain(PNG.data);
  });

  it("keeps an image until the last record using it is deleted", async () => {
    await saveConversation(withImages("a", [PNG, JPEG]));
    await saveConversation(withImages("b", [PNG]));

    await deleteConversation("a");
    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("b")).toStrictEqual([PNG]);

    await deleteConversation("b");
    expect(await storedImageKeys()).toHaveLength(0);
  });

  it("sweeps images only unbookmarked records used", async () => {
    await saveConversation(withImages("kept", [PNG], { bookmarked: true }));
    await saveConversation(withImages("gone", [JPEG]));

    await deleteUnbookmarkedConversations();

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("kept")).toStrictEqual([PNG]);
  });

  it("clears every image with every conversation", async () => {
    await saveConversation(withImages("a", [PNG]));

    await deleteAllConversations();

    expect(await storedImageKeys()).toHaveLength(0);
  });

  it("sweeps an image a re-save no longer uses", async () => {
    await saveConversation(withImages("a", [PNG]));
    await saveConversation(withImages("a", [JPEG]));

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("a")).toStrictEqual([JPEG]);
  });

  it("restores the images of an undone delete", async () => {
    await saveConversation(withImages("a", [PNG]));

    const snapshot = await loadConversation("a");

    await deleteConversation("a");
    await saveConversation(snapshot as ConversationRecord);

    expect(await imagesOf("a")).toStrictEqual([PNG]);
  });

  it("reads inline images and moves them on the next save", async () => {
    await putRaw(withImages("legacy", [PNG]));

    const loaded = await loadConversation("legacy");

    expect(loaded?.messages[0]?.images).toStrictEqual([PNG]);
    expect(await storedImageKeys()).toHaveLength(0);

    await saveConversation(loaded as ConversationRecord);
    expect(await storedImageKeys()).toHaveLength(1);
  });

  it("drops an image whose bytes are missing", async () => {
    await putRaw(
      createTestRecord({
        id: "orphan",
        messages: [
          {
            role: "user",
            content: "x",
            images: [{ mediaType: "image/png", ref: "nope" } as never],
          },
        ],
      }),
    );

    expect(await imagesOf("orphan")).toStrictEqual([]);
  });

  it("loads every record with its images for export", async () => {
    await saveConversation(withImages("a", [PNG]));
    await putRaw({ id: "corrupt", updatedAt: 0 });

    const all = await loadAllConversations();

    expect(all.find((r) => r.id === "a")?.messages[0]?.images).toStrictEqual([
      PNG,
    ]);
    expect(all.find((r) => r.id === "corrupt")).toStrictEqual({
      id: "corrupt",
      updatedAt: 0,
    });
  });

  it("tolerates corrupt records while sweeping", async () => {
    await saveConversation(withImages("a", [PNG]));
    await putRaw({ id: "no-messages", updatedAt: 0 });
    await putRaw(
      createTestRecord({ id: "null-message", messages: [null as never] }),
    );

    await deleteConversation("missing");

    expect(await storedImageKeys()).toHaveLength(1);
  });
});

describe("upgrade from version 1", () => {
  beforeEach(async () => {
    await resetDbCache();
    await deleteIndexedDb(DB_NAME);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Create a version 1 database holding one record with an inline image.
   * @returns The open version 1 connection
   */
  function createVersion1Db(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("conversations", {
          keyPath: "id",
        });

        store.createIndex("updatedAt", "updatedAt");
        store.put(withImages("old", [PNG]));
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  it("adds the image store and keeps existing records", async () => {
    const oldDb = await createVersion1Db();

    oldDb.close();

    expect(await imagesOf("old")).toStrictEqual([PNG]);
    expect(await storedImageKeys()).toHaveLength(0);
  });

  it("asks to close other tabs while an old one blocks the upgrade", async () => {
    const alertSpy = vi.fn();

    vi.stubGlobal("alert", alertSpy);
    const oldTab = await createVersion1Db();
    const opening = getConversationDb();

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    oldTab.close();

    const db = await opening;

    expect(db.version).toBe(2);
  });
});
