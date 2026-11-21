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
  getConversationDb,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { IMAGE_DB_NAME, getImageDb } from "#webui/lib/conversations/image-db";
import { openTrackedDb } from "#webui/lib/conversations/open-tracked-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

const DB_NAME = "producer-pal-conversations";
const PNG: ChatImage = { mediaType: "image/png", data: "iVBORw0KGgo=" };

/**
 * A record whose first message carries the given images.
 * @param id - Record id
 * @param images - Attached images (inline, or refs for a stored record)
 * @returns The record
 */
function withImages(id: string, images: unknown[]): ConversationRecord {
  return createTestRecord({
    id,
    messages: [{ role: "user", content: "hi", images: images as ChatImage[] }],
  });
}

/**
 * Open a database directly, as a build other than this one would.
 * @param name - Database name
 * @param version - Version to open at; omit for the current one
 * @param upgrade - Runs when the version changes
 * @returns The open connection
 */
function rawOpen(
  name: string,
  version?: number,
  upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Create the conversations store the way every build does.
 * @param db - Database being upgraded
 * @param records - Records to put in it
 */
function createConversations(db: IDBDatabase, records: unknown[] = []): void {
  const store = db.createObjectStore("conversations", { keyPath: "id" });

  store.createIndex("updatedAt", "updatedAt");

  for (const record of records) {
    store.put(record);
  }
}

/**
 * Read one value straight from a database.
 * @param db - Open connection
 * @param store - Object store name
 * @param key - Key to read
 * @returns The value, or undefined
 */
function rawGet(db: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * How many images the image database holds.
 * @returns The count
 */
async function storedImageCount(): Promise<number> {
  const db = await getImageDb();

  return await db.count("images");
}

/**
 * A record's first message's images, as the UI would see them.
 * @param id - Record id
 * @returns Its images
 */
async function imagesOf(id: string): Promise<ChatImage[] | undefined> {
  const record = await loadConversation(id);

  return record?.messages[0]?.images;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDbCache().catch(() => {});
  await deleteIndexedDb(DB_NAME);
  await deleteIndexedDb(IMAGE_DB_NAME);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await resetDbCache().catch(() => {});
});

/**
 * Drop the app's cached connection and open the database the way 2.5.0 does,
 * with a plain version-1 open.
 * @returns The raw version-1 connection
 */
async function reopenAs250(): Promise<IDBDatabase> {
  await resetDbCache();

  const old = await rawOpen(DB_NAME, 1);

  expect(old.version).toBe(1);

  return old;
}

describe("a fresh install", () => {
  it("passes on an open failure that isn't a version error", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    await expect(getConversationDb()).rejects.toThrow("storage disabled");
  });

  it("keeps the conversations database at version 1, images elsewhere", async () => {
    const db = await getConversationDb();

    expect(db.version).toBe(1);
    expect([...db.objectStoreNames]).toStrictEqual(["conversations"]);

    await saveConversation(withImages("a", [PNG]));

    expect(await storedImageCount()).toBe(1);
  });

  it("still opens with a plain version-1 open, as 2.5.0 does", async () => {
    await saveConversation(withImages("a", [PNG]));
    const old = await reopenAs250();

    // What 2.5.0 would read: the record, with its image as a ref it ignores.
    expect(await rawGet(old, "conversations", "a")).toStrictEqual(
      expect.objectContaining({
        id: "a",
        messages: [
          expect.objectContaining({
            imageRefs: [{ mediaType: "image/png", ref: expect.any(String) }],
          }),
        ],
      }),
    );
    old.close();
  });
});

describe("a version 1 database from 2.5.0", () => {
  it("stays at version 1 and moves inline images on the next save", async () => {
    const old = await rawOpen(DB_NAME, 1, (db) =>
      createConversations(db, [withImages("old", [PNG])]),
    );

    old.close();

    const db = await getConversationDb();
    const loaded = await loadConversation("old");

    expect(db.version).toBe(1);
    expect(await imagesOf("old")).toStrictEqual([PNG]);

    await saveConversation(loaded!);
    expect(await storedImageCount()).toBe(1);
  });

  it("recreates an empty database at version 1, once other tabs let go", async () => {
    const alertSpy = vi.fn();

    vi.stubGlobal("alert", alertSpy);

    const empty = await rawOpen(DB_NAME, 1, () => {});
    const opening = getConversationDb();

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    empty.close();

    const db = await opening;

    expect(db.version).toBe(1);
    expect(db.objectStoreNames).toContain("conversations");
    await saveConversation(withImages("a", [PNG]));
    expect(await imagesOf("a")).toStrictEqual([PNG]);

    // What 2.5.0 does still works.
    const old = await reopenAs250();

    expect(await rawGet(old, "conversations", "a")).toStrictEqual(
      expect.objectContaining({ id: "a" }),
    );
    old.close();
  });
});

describe("a version 2 database from a pre-release build", () => {
  /**
   * Create the version 2 layout: images in the conversations database itself.
   * @param count - How many images to store
   */
  async function createVersion2Db(count = 1): Promise<void> {
    const refs = Array.from({ length: count }, (_, i) => `ref-${i}`);
    const db = await rawOpen(DB_NAME, 2, (upgrade) => {
      createConversations(upgrade, [
        withImages(
          "old",
          refs.map((ref) => ({ mediaType: "image/png", ref })),
        ),
      ]);

      const images = upgrade.createObjectStore("images");

      for (const ref of refs) {
        images.put(`bytes-${ref}`, ref);
      }
    });

    db.close();
  }

  it("opens as is, with no prompt, and keeps its images", async () => {
    const confirmSpy = vi.fn(() => true);

    vi.stubGlobal("confirm", confirmSpy);
    await createVersion2Db();

    const db = await getConversationDb();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(db.version).toBe(2);
    expect(await imagesOf("old")).toStrictEqual([
      { mediaType: "image/png", data: "bytes-ref-0" },
    ]);
  });

  it("moves every image to the image database and empties the old store", async () => {
    await createVersion2Db(25); // more than one batch

    const db = await getConversationDb();

    expect(await db.count("images")).toBe(0);
    expect(await storedImageCount()).toBe(25);
  });

  it("can be run again after the images are gone", async () => {
    await createVersion2Db();
    await getConversationDb();
    await resetDbCache();

    await getConversationDb();

    expect(await storedImageCount()).toBe(1);
    expect(await imagesOf("old")).toHaveLength(1);
  });

  it("never drops an image it could not copy, and retries next open", async () => {
    await createVersion2Db(2);

    const put = IDBObjectStore.prototype.put;
    const failing = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "images") {
          throw new Error("disk full");
        }

        return put.apply(this, args);
      });

    await expect(getConversationDb()).rejects.toThrow("disk full");
    failing.mockRestore();
    await resetDbCache().catch(() => {});

    const old = await rawOpen(DB_NAME);

    expect(await rawGet(old, "images", "ref-0")).toBe("bytes-ref-0");
    old.close();

    const db = await getConversationDb();

    expect(await db.count("images")).toBe(0);
    expect(await storedImageCount()).toBe(2);
  });

  it("skips an image another tab already moved", async () => {
    await createVersion2Db(2);

    const db = await rawOpen(DB_NAME);

    // This tab lists both keys, then the other tab moves one of them.
    const getAllKeys = IDBObjectStore.prototype.getAllKeys;

    vi.spyOn(IDBObjectStore.prototype, "getAllKeys").mockImplementation(
      function (this: IDBObjectStore, ...args) {
        const request = getAllKeys.apply(this, args);

        if (this.name === "images" && this.transaction.db.name === DB_NAME) {
          const tx = db.transaction("images", "readwrite");

          tx.objectStore("images").delete("ref-0");
        }

        return request;
      },
    );
    const opened = await getConversationDb();

    db.close();

    expect(await opened.count("images")).toBe(0);
    expect(await storedImageCount()).toBe(1);
  });
});

describe("opening a database at a newer version", () => {
  it("asks to close other tabs while an older one holds it", async () => {
    const alertSpy = vi.fn();

    vi.stubGlobal("alert", alertSpy);

    const older = await rawOpen("upgrade-test-db", 1, () => {});
    const opening = openTrackedDb("upgrade-test-db", 2, () => {});

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    older.close();

    const db = await opening;

    expect(db.version).toBe(2);
    db.close();
    await deleteIndexedDb("upgrade-test-db");
  });
});

describe("a newer build upgrading either database", () => {
  /**
   * Open a database at a newer version, as another tab on a newer build would.
   * @param name - Database name
   * @returns The open connection
   */
  function openNewer(name: string): Promise<IDBDatabase> {
    return rawOpen(name, 3, () => {});
  }

  it("lets go of both databases, tells the user, and never reopens", async () => {
    const alertSpy = vi.fn();
    const confirmSpy = vi.fn(() => true);

    vi.stubGlobal("alert", alertSpy);
    vi.stubGlobal("confirm", confirmSpy);
    await saveConversation(withImages("a", [PNG]));

    // Resolves only if this tab let go of its connection.
    const newer = await openNewer(IMAGE_DB_NAME);

    expect(alertSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Reload"),
    );
    // The conversations database is released too.
    const newerConversations = await openNewer(DB_NAME);

    await expect(loadConversation("a")).rejects.toThrow("reload this one");
    await expect(saveConversation(withImages("b", []))).rejects.toThrow(
      "reload this one",
    );

    // No reset prompt.
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(newerConversations.objectStoreNames).toContain("conversations");
    newer.close();
    newerConversations.close();
  });
});

describe("the backup offered on a version mismatch", () => {
  let backup: Promise<string> | undefined;

  beforeEach(() => {
    backup = undefined;
    vi.stubGlobal("confirm", () => true);
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      backup = (blob as Blob).text();

      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue({
      click: () => {},
    } as unknown as HTMLElement);
  });

  /**
   * The conversations in the downloaded backup.
   * @returns The exported records
   */
  async function exportedBackup(): Promise<ConversationRecord[]> {
    const text = await backup;
    const parsed = JSON.parse(text!) as { conversations: ConversationRecord[] };

    return parsed.conversations;
  }

  /** Leave a conversation with an image, then a newer conversations DB. */
  async function leaveNewerDb(): Promise<void> {
    await saveConversation(withImages("a", [PNG]));
    await resetDbCache();

    const db = await rawOpen(DB_NAME, 99, () => {});

    db.close();
  }

  it("carries the images", async () => {
    await leaveNewerDb();
    await getConversationDb();

    const exported = await exportedBackup();

    expect(exported[0]?.messages[0]?.images).toStrictEqual([PNG]);
  });

  it("is still made when the image database can't be read", async () => {
    await leaveNewerDb();

    const newerImages = await rawOpen(IMAGE_DB_NAME, 99, () => {});

    newerImages.close();
    await getConversationDb();

    expect(await exportedBackup()).toHaveLength(1);
  });
});
