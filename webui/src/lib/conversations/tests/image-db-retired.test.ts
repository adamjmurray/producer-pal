// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ConversationRecord,
  resetDbCache,
} from "#webui/lib/conversation-db";
import {
  loadConversationImages,
  storeConversationImages,
} from "#webui/lib/conversations/conversation-images";
import { IMAGE_DB_NAME, getImageDb } from "#webui/lib/conversations/image-db";
import {
  PNG_IMAGE,
  resetConversationDatabases,
} from "#webui/test-utils/conversation-image-test-helpers";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

beforeEach(async () => {
  await resetConversationDatabases();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  // Also clears the "stepped aside" state a newer build sets.
  await resetDbCache().catch(() => {});
});

describe("the image database after a newer build took over", () => {
  it("refuses to open again and tells the user to reload", async () => {
    vi.stubGlobal("alert", vi.fn());
    await getImageDb();

    // Resolves only if this tab let go of its connection.
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(IMAGE_DB_NAME, 99);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await expect(getImageDb()).rejects.toThrow("reload this one");
    newer.close();
  });
});

describe("images on records that are not the usual shape", () => {
  it("restores the images of a record that has no id", async () => {
    const stored = await storeConversationImages({
      messages: [{ role: "user", content: "look", images: [PNG_IMAGE] }],
    });

    expect(stored.messages[0]).not.toHaveProperty("images");

    const loaded = await loadConversationImages(stored);

    expect(loaded.messages[0]?.images).toStrictEqual([PNG_IMAGE]);
    expect(loaded.messages[0]).not.toHaveProperty("imageRefs");
  });

  it("stores a record that has lost its messages as it is", async () => {
    const broken = createTestRecord({ id: "broken" });

    delete (broken as Partial<ConversationRecord>).messages;

    expect(await storeConversationImages(broken)).toBe(broken);
  });
});
