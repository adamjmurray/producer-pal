// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { type ChatImage } from "#webui/chat/sdk/types";
import { resetDbCache } from "#webui/lib/conversation-db";
import {
  IMAGE_DB_NAME,
  resetImageDbCache,
} from "#webui/lib/conversations/image-db";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

export const PNG_IMAGE: ChatImage = {
  mediaType: "image/png",
  data: "iVBORw0KGgo=",
};
export const JPEG_IMAGE: ChatImage = {
  mediaType: "image/jpeg",
  data: "/9j/4AAQSkZJRg==",
};

/**
 * Start a test from empty conversation and image databases.
 */
export async function resetConversationDatabases(): Promise<void> {
  await resetDbCache();
  await resetImageDbCache();
  await deleteIndexedDb("producer-pal-conversations");
  await deleteIndexedDb(IMAGE_DB_NAME);
}

/**
 * Make every open of the image database fail until the spy is restored.
 * @returns The spy
 */
export function failImageDbOpens(): ReturnType<typeof vi.spyOn> {
  const open = indexedDB.open.bind(indexedDB);

  return vi
    .spyOn(indexedDB, "open")
    .mockImplementation((name: string, version?: number) => {
      if (name === IMAGE_DB_NAME) {
        throw new Error("image db unavailable");
      }

      return open(name, version);
    });
}
