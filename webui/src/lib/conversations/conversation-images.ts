// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ChatImage, type ChatMessage } from "#webui/chat/sdk/types";

/**
 * Image bytes keyed by content hash, shared by every record that shows them,
 * so an edit/retry fork doesn't store another copy. Records hold
 * `{ mediaType, ref }` instead of the bytes.
 */
export const IMAGE_STORE = "images";

/** The parts of an idb object store this module reads. */
interface ImageStore {
  get: (key: string) => Promise<unknown>;
  getAllKeys: () => Promise<IDBValidKey[]>;
}

/** The same, in a readwrite transaction. */
interface WritableImageStore extends ImageStore {
  put: (value: string, key: string) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
}

/** How an image sits in a stored record: its bytes live under `ref`. */
interface StoredImage {
  mediaType: string;
  ref: string;
}

/** Anything persisted with chat messages (a conversation record). */
interface WithMessages {
  messages: ChatMessage[];
}

/**
 * Move a record's image bytes into the image store, returning the copy to
 * write in their place. Images saved before the store existed are inline, and
 * move on their next save.
 * @param record - Record with inline images
 * @param store - The image store, in a readwrite transaction
 * @returns A copy whose images are refs
 */
export function storeConversationImages<T extends WithMessages>(
  record: T,
  store: WritableImageStore,
): T {
  return mapImages(record, (image) => {
    if (isStoredImage(image)) {
      return image;
    }

    const ref = hashImageData(image.data);

    void store.put(image.data, ref);

    return { mediaType: image.mediaType, ref };
  });
}

/**
 * Put a stored record's image bytes back. An image whose bytes are missing is
 * dropped: an empty one would fail the next model request.
 * @param record - Record as read from the conversation store
 * @param store - The image store
 * @returns A copy with inline images
 */
export async function loadConversationImages<T extends WithMessages>(
  record: T,
  store: ImageStore,
): Promise<T> {
  const bytes = new Map<string, string | undefined>();

  for (const ref of conversationImageRefs([record])) {
    bytes.set(ref, (await store.get(ref)) as string | undefined);
  }

  return mapImages(record, (image) => {
    if (!isStoredImage(image)) {
      return image;
    }

    const data = bytes.get(image.ref);

    return data == null ? null : { mediaType: image.mediaType, data };
  });
}

/**
 * Delete the images no remaining record refers to. Run it in the transaction
 * that removed or rewrote records, so a save in another tab can't add a
 * reference between the scan and the delete.
 * @param records - Every record left in the conversation store
 * @param store - The image store, in a readwrite transaction
 */
export async function sweepConversationImages(
  records: WithMessages[],
  store: WritableImageStore,
): Promise<void> {
  const inUse = conversationImageRefs(records);

  for (const ref of (await store.getAllKeys()) as string[]) {
    if (!inUse.has(ref)) {
      void store.delete(ref);
    }
  }
}

/**
 * Hash image bytes into a store key. Not `crypto.subtle`: browsers leave it
 * out on plain-HTTP origins, and the chat UI is served over HTTP on a LAN.
 * Two seeded 53-bit hashes plus the length make a collision negligible.
 * @param data - Base64 image bytes
 * @returns Store key
 */
function hashImageData(data: string): string {
  return `${cyrb53(data, 1).toString(36)}-${cyrb53(data, 2).toString(36)}-${data.length.toString(36)}`;
}

/**
 * Collect the image refs a set of stored records use.
 * @param records - Stored records
 * @returns Refs in use
 */
function conversationImageRefs(records: WithMessages[]): Set<string> {
  const refs = new Set<string>();

  for (const record of records) {
    // A corrupt or imported record can lack messages or carry a null one.
    for (const message of (record.messages as ChatMessage[] | undefined) ??
      []) {
      for (const image of storedImagesOf(message)) {
        if (isStoredImage(image)) {
          refs.add(image.ref);
        }
      }
    }
  }

  return refs;
}

/**
 * Copy a record, passing each image through `change`; null drops the image.
 * @param record - Record to copy
 * @param change - Maps one image
 * @returns The copy (messages without images are reused as-is)
 */
function mapImages<T extends WithMessages>(
  record: T,
  change: (image: ChatImage | StoredImage) => ChatImage | StoredImage | null,
): T {
  const messages = (record.messages as ChatMessage[] | undefined)?.map(
    (message) => {
      const images = storedImagesOf(message);

      if (images.length === 0) {
        return message;
      }

      const mapped = images
        .map(change)
        .filter((image) => image != null) as ChatImage[];

      return { ...message, images: mapped };
    },
  );

  return messages == null ? record : { ...record, messages };
}

/**
 * A message's images, read loosely since stored ones may be refs.
 * @param message - Stored or in-memory message
 * @returns Its images, or none
 */
function storedImagesOf(
  message: ChatMessage | null,
): Array<ChatImage | StoredImage> {
  const images = (message as { images?: unknown } | null)?.images;

  return Array.isArray(images)
    ? (images as Array<ChatImage | StoredImage>)
    : [];
}

/**
 * Whether an image is a ref into the image store.
 * @param image - Stored or inline image
 * @returns True for a ref
 */
function isStoredImage(image: ChatImage | StoredImage): image is StoredImage {
  return typeof (image as Partial<StoredImage>).ref === "string";
}

/**
 * cyrb53: a fast, well-mixed 53-bit string hash.
 * @param str - Input
 * @param seed - Seed for an independent hash
 * @returns 53-bit unsigned integer
 */
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);

    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
