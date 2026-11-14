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
  deleteConversation,
  getConversationDb,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import {
  IMAGE_DB_NAME,
  getImageDb,
  resetImageDbCache,
} from "#webui/lib/conversations/image-db";
import {
  loadConversationImages,
  storeConversationImages,
} from "#webui/lib/conversations/conversation-images";
import { failImageDbOpens } from "#webui/test-utils/conversation-image-test-helpers";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

const DB_NAME = "producer-pal-conversations";
const PNG: ChatImage = { mediaType: "image/png", data: "iVBORw0KGgo=" };

/**
 * A record whose first user message carries the image.
 * @param id - Record id
 * @param content - Text of the first message
 * @returns The record
 */
function withImage(id: string, content = "match this"): ConversationRecord {
  return createTestRecord({
    id,
    messages: [
      { role: "user", content, images: [PNG] },
      { role: "assistant", content: "ok" },
    ],
  });
}

/**
 * Save a conversation with an image, then open it while the image database
 * won't open. The database works again when this returns.
 * @returns The conversation as opened, without its image
 */
async function openWithoutImages(): Promise<ConversationRecord> {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await saveConversation(withImage("a"));
  await resetImageDbCache();

  const spy = failImageDbOpens();
  const loaded = (await loadConversation("a", {
    tolerateImageFailure: true,
  })) as ConversationRecord;

  spy.mockRestore();

  return loaded;
}

/**
 * Make a sweep's age check pass, so an image no record uses may be deleted.
 */
async function ageImages(): Promise<void> {
  const db = await getImageDb();

  await db.clear("touched");
}

describe("a failed image database open", () => {
  beforeEach(async () => {
    await resetDbCache();
    await resetImageDbCache();
    await deleteIndexedDb(DB_NAME);
    await deleteIndexedDb(IMAGE_DB_NAME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is retried by the next call", async () => {
    const spy = failImageDbOpens();

    await expect(getImageDb()).rejects.toThrow("image db unavailable");
    spy.mockRestore();

    await expect(getImageDb()).resolves.toBeDefined();
  });

  it("is retried by the next call for the conversations database too", async () => {
    const open = indexedDB.open.bind(indexedDB);
    const spy = vi.spyOn(indexedDB, "open").mockImplementationOnce(() => {
      throw new Error("conversations db unavailable");
    });

    await expect(getConversationDb()).rejects.toThrow(
      "conversations db unavailable",
    );
    spy.mockImplementation(open as typeof indexedDB.open);

    await expect(getConversationDb()).resolves.toBeDefined();
  });

  it("doesn't undo a newer open when it finally settles", async () => {
    const spy = failImageDbOpens();
    const failed = getImageDb().then(
      () => "opened",
      (error: Error) => error.message,
    );
    const reset = resetImageDbCache();

    spy.mockRestore();

    const fresh = await getImageDb();

    expect(await failed).toBe("image db unavailable");
    await reset;
    expect(await getImageDb()).toBe(fresh);
  });

  it("doesn't undo a newer conversations open when it finally settles", async () => {
    const spy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("conversations db unavailable");
    });
    const failed = getConversationDb().then(
      () => "opened",
      (error: Error) => error.message,
    );
    const reset = resetDbCache();

    spy.mockRestore();

    const fresh = await getConversationDb();

    expect(await failed).toBe("conversations db unavailable");
    await reset;
    expect(await getConversationDb()).toBe(fresh);
  });

  it("rejects a load by default", async () => {
    await saveConversation(withImage("a"));
    await resetImageDbCache();
    failImageDbOpens();

    await expect(loadConversation("a")).rejects.toThrow("image db unavailable");
  });

  it("opens with its text, and without the images, when tolerated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await saveConversation(withImage("a"));
    await resetImageDbCache();
    failImageDbOpens();

    const loaded = await loadConversation("a", { tolerateImageFailure: true });

    expect(loaded?.messages[0]).toStrictEqual({
      role: "user",
      content: "match this",
      images: [],
    });
    expect(loaded?.messages[1]?.content).toBe("ok");
  });

  it("keeps the stored images when the opened conversation is saved", async () => {
    const loaded = await openWithoutImages();

    // The user carries on chatting once the database is back.
    await saveConversation({
      ...loaded,
      messages: [...loaded.messages, { role: "user", content: "more" }],
    });
    await ageImages();
    await deleteConversation("other");

    const reloaded = await loadConversation("a");

    expect(reloaded?.messages[0]?.images).toStrictEqual([PNG]);
    expect(reloaded?.messages).toHaveLength(3);
  });

  it("does not put an image back on a message that was edited", async () => {
    const loaded = await openWithoutImages();

    await saveConversation({
      ...loaded,
      messages: [{ role: "user", content: "something else" }],
    });

    const reloaded = await loadConversation("a");

    expect(reloaded?.messages[0]?.images).toBeUndefined();
  });

  it("stops putting images back once the conversation is read in full", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await saveConversation(withImage("a"));
    await resetImageDbCache();

    const spy = failImageDbOpens();

    await loadConversation("a", { tolerateImageFailure: true });
    spy.mockRestore();

    // Read properly, then the user removes the image.
    const full = (await loadConversation("a")) as ConversationRecord;

    expect(full.messages[0]?.images).toStrictEqual([PNG]);
    await saveConversation({
      ...full,
      messages: [{ role: "user", content: "match this" }, full.messages[1]!],
    });

    const reloaded = await loadConversation("a");

    expect(reloaded?.messages[0]?.images).toBeUndefined();
  });

  it("opens a record with no id, keeping its inline images", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failImageDbOpens();

    const record = {
      messages: [
        {
          role: "user" as const,
          content: "x",
          images: [PNG, { mediaType: "image/png", ref: "r" } as never],
        },
      ],
    };

    const loaded = await loadConversationImages(record, {
      tolerateFailure: true,
    });

    expect(loaded.messages[0]?.images).toStrictEqual([PNG]);
    // Nothing to put back for a record that can't be told apart.
    expect(
      await storeConversationImages({
        messages: [{ role: "user", content: "x" }],
      }),
    ).toStrictEqual({ messages: [{ role: "user", content: "x" }] });
  });
});
