// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type ConversationRecord,
  getConversationDb,
  saveConversation,
} from "#webui/lib/conversation-db";
import {
  pinConversationImages,
  sweepConversationImages,
} from "#webui/lib/conversations/conversation-images";
import { getImageDb } from "#webui/lib/conversations/image-db";
import {
  PNG_IMAGE,
  resetConversationDatabases,
} from "#webui/test-utils/conversation-image-test-helpers";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

/**
 * Sweep as if no record used any image, with nothing recently touched.
 * @returns How many images are left
 */
async function sweepAll(): Promise<number> {
  const db = await getImageDb();

  await db.clear("touched");
  await sweepConversationImages([]);

  return await db.count("images");
}

/**
 * Save a conversation with one image, and read it back as stored.
 * @returns The stored record, refs intact
 */
async function storedWithImage(): Promise<ConversationRecord> {
  const record = createTestRecord({
    id: "a",
    messages: [{ role: "user", content: "look", images: [PNG_IMAGE] }],
  });

  await saveConversation(record);

  const db = await getConversationDb();

  return (await db.get("conversations", "a")) as ConversationRecord;
}

describe("pinConversationImages", () => {
  beforeEach(async () => {
    await resetConversationDatabases();
  });

  it("keeps an image through a sweep until released", async () => {
    const stored = await storedWithImage();
    const release = pinConversationImages(stored);

    expect(await sweepAll()).toBe(1);
    release();
    expect(await sweepAll()).toBe(0);
  });

  it("holds an image until every pin on it is released", async () => {
    const stored = await storedWithImage();
    const first = pinConversationImages(stored);
    const second = pinConversationImages(stored);

    first();
    first();
    expect(await sweepAll()).toBe(1);
    second();
    expect(await sweepAll()).toBe(0);
  });
});
