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
import { storeConversationImages } from "#webui/lib/conversations/conversation-images";
import { IMAGE_DB_NAME, getImageDb } from "#webui/lib/conversations/image-db";
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
  const db = await getImageDb();

  return await db.getAllKeys("images");
}

/**
 * Make every stored image look old, so a sweep may take it. Sweeps spare an
 * image saved in the last minute.
 */
async function ageImages(): Promise<void> {
  const db = await getImageDb();

  await db.clear("touched");
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
    await deleteIndexedDb(IMAGE_DB_NAME);
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
    await ageImages();

    await deleteConversation("a");
    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("b")).toStrictEqual([PNG]);

    await deleteConversation("b");
    expect(await storedImageKeys()).toHaveLength(0);
  });

  it("sweeps images only unbookmarked records used", async () => {
    await saveConversation(withImages("kept", [PNG], { bookmarked: true }));
    await saveConversation(withImages("gone", [JPEG]));
    await ageImages();

    await deleteUnbookmarkedConversations();

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("kept")).toStrictEqual([PNG]);
  });

  it("clears every image with every conversation, even one just saved", async () => {
    await saveConversation(withImages("a", [PNG]));

    await deleteAllConversations();

    const db = await getImageDb();

    expect(await storedImageKeys()).toHaveLength(0);
    expect(await db.count("touched")).toBe(0);
  });

  it("still deletes the records when clearing the images fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await saveConversation(withImages("a", [PNG]));
    const clear = IDBObjectStore.prototype.clear;

    vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(function (
      this: IDBObjectStore,
    ) {
      if (this.name === "images") {
        throw new Error("clear failed");
      }

      return clear.call(this);
    });

    await deleteAllConversations();

    expect(error).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
    expect(await loadConversation("a")).toBeUndefined();
  });

  it("sweeps an image a re-save no longer uses", async () => {
    await saveConversation(withImages("a", [PNG]));
    await ageImages();
    await saveConversation(withImages("a", [JPEG]));

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("a")).toStrictEqual([JPEG]);
  });

  it("restores the images of an undone delete", async () => {
    await saveConversation(withImages("a", [PNG]));

    const snapshot = await loadConversation("a");

    await ageImages();
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

  it("keeps the images of a record saved again as stored refs", async () => {
    await saveConversation(withImages("a", [PNG]));

    const refsOnly = await loadConversation("a", { images: false });

    await saveConversation(refsOnly!);

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("a")).toStrictEqual([PNG]);
  });

  it("loads a record mixing stored and inline images", async () => {
    await saveConversation(withImages("a", [PNG]));

    const [ref] = await storedImageKeys();

    await putRaw(
      withImages("mixed", [JPEG, { mediaType: PNG.mediaType, ref } as never]),
    );

    expect(await imagesOf("mixed")).toStrictEqual([JPEG, PNG]);
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

  it("reuses a loaded image's ref instead of hashing it again", async () => {
    await saveConversation(withImages("a", [PNG]));

    const [key] = await storedImageKeys();
    const loaded = await loadConversation("a");
    const image = loaded?.messages[0]?.images?.[0];

    // Different bytes can only keep the old ref if the save skipped hashing.
    // (Images are never edited in the app; this is how a test sees the cache.)
    image!.data = "changed";
    await saveConversation(loaded!);

    expect(await storedImageKeys()).toStrictEqual([key]);
  });

  it("writes a known image's bytes again if another save swept them", async () => {
    await saveConversation(withImages("a", [PNG]));

    const loaded = await loadConversation("a");
    const db = await getImageDb();

    await db.clear("images");
    await saveConversation(loaded!);

    expect(await imagesOf("a")).toStrictEqual([PNG]);
  });

  it("skips the image bytes when asked for metadata only", async () => {
    await saveConversation(withImages("a", [PNG], { title: "kept" }));

    const get = vi.spyOn(IDBObjectStore.prototype, "get");

    try {
      const loaded = await loadConversation("a", { images: false });

      expect(loaded?.title).toBe("kept");
      expect(
        get.mock.contexts.map((s) => (s as IDBObjectStore).name),
      ).toStrictEqual(["conversations"]);
    } finally {
      get.mockRestore();
    }
  });

  it("doesn't write images that are already stored", async () => {
    await saveConversation(withImages("a", [PNG]));

    const put = vi.spyOn(IDBObjectStore.prototype, "put");

    try {
      await saveConversation((await loadConversation("a"))!);
      await saveConversation(withImages("a", [{ ...PNG }]));

      expect(
        put.mock.contexts.filter(
          (s) => (s as IDBObjectStore).name === "images",
        ),
      ).toHaveLength(0);
    } finally {
      put.mockRestore();
    }
  });

  it("writes an image's bytes once however often a record repeats it", async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, "put");

    try {
      await saveConversation(withImages("a", [PNG, { ...PNG }]));

      expect(
        put.mock.contexts.filter(
          (s) => (s as IDBObjectStore).name === "images",
        ),
      ).toHaveLength(1);
    } finally {
      put.mockRestore();
    }
  });

  it("writes an image again when its bytes were swept after it was hashed", async () => {
    const record = withImages("a", [{ ...PNG }]);

    await saveConversation(record);

    const db = await getImageDb();

    await db.clear("images");
    await saveConversation(record);

    expect(await storedImageKeys()).toHaveLength(1);
    expect(await imagesOf("a")).toStrictEqual([PNG]);
  });

  it("reuses the ref of a newly saved image on its next save", async () => {
    const record = withImages("a", [{ ...PNG }]);
    const image = record.messages[0]!.images![0]!;

    await saveConversation(record);

    const [key] = await storedImageKeys();

    image.data = "changed";
    await saveConversation(record);

    expect(await storedImageKeys()).toStrictEqual([key]);
  });
});

describe("writing and sweeping across the two databases", () => {
  beforeEach(async () => {
    await resetDbCache();
    await deleteIndexedDb(DB_NAME);
    await deleteIndexedDb(IMAGE_DB_NAME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the image before the record", async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, "put");

    await saveConversation(withImages("a", [PNG]));

    const stores = put.mock.contexts.map((s) => (s as IDBObjectStore).name);

    expect(stores.indexOf("images")).toBeLessThan(
      stores.indexOf("conversations"),
    );
  });

  it("leaves only an unused image if the record never gets written", async () => {
    await getConversationDb();

    const put = IDBObjectStore.prototype.put;

    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "conversations") {
        throw new Error("crash");
      }

      return put.apply(this, args);
    });

    await expect(saveConversation(withImages("a", [PNG]))).rejects.toThrow(
      "crash",
    );
    vi.restoreAllMocks();

    expect(await loadConversation("a")).toBeUndefined();

    // The next sweep, once the image is old enough, removes it.
    await ageImages();
    await saveConversation(withImages("b", []));
    expect(await storedImageKeys()).toHaveLength(0);
  });

  it("spares an image saved just before its record is written", async () => {
    const stored = await storeConversationImages(withImages("a", [PNG]));

    // A sweep in another tab, which knows no record that uses it.
    await deleteConversation("other");
    expect(await storedImageKeys()).toHaveLength(1);

    const db = await getConversationDb();

    await db.put("conversations", stored);
    expect(await imagesOf("a")).toStrictEqual([PNG]);
  });

  it("spares a stored image another save has just re-used", async () => {
    await saveConversation(withImages("a", [PNG]));
    await ageImages();

    // Re-using the image marks it, before the record that uses it is written.
    const stored = await storeConversationImages(withImages("b", [PNG]));

    await deleteConversation("a");
    expect(await storedImageKeys()).toHaveLength(1);

    const db = await getConversationDb();

    await db.put("conversations", stored);
    expect(await imagesOf("b")).toStrictEqual([PNG]);
  });

  it("still saves the record when the sweep fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await saveConversation(withImages("a", [PNG]));
    vi.spyOn(IDBObjectStore.prototype, "getAllKeys").mockImplementation(() => {
      throw new Error("sweep failed");
    });

    await expect(
      saveConversation(withImages("b", [JPEG])),
    ).resolves.toMatchObject({ saved: true });
    expect(error).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
    expect(await imagesOf("b")).toStrictEqual([JPEG]);
  });
});
