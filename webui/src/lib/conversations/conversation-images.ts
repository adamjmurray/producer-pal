// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ChatImage, type ChatMessage } from "#webui/chat/sdk/types";
import {
  IMAGE_STORE,
  TOUCHED_STORE,
  getImageDb,
} from "#webui/lib/conversations/image-db";

/**
 * How long a sweep spares an image after a save wrote or re-used it. An image
 * is written before its conversation is (the two live in different databases),
 * so a sweep landing between them must not take it.
 */
const SPARED_MS = 60_000;

/**
 * Ref per in-memory image, so a save skips the hash. Images never change. It
 * doesn't say the bytes are still stored: every save checks the store.
 */
const knownRefs = new WeakMap<object, string>();

/**
 * Stored messages of conversations opened while their image bytes couldn't be
 * read, by id. The opened copy has no such images, so a save would drop their
 * refs and the next sweep would delete the bytes. {@link storeConversationImages}
 * puts the refs back.
 */
const unreadImages = new Map<string, ChatMessage[]>();

/** How an image sits in a stored record: its bytes live under `ref`. */
interface StoredImage {
  mediaType: string;
  ref: string;
}

/** Anything persisted with chat messages (a conversation record). */
interface WithMessages {
  messages: ChatMessage[];
}

/** What {@link loadConversationImages} does when the bytes can't be read. */
export interface LoadImagesOptions {
  /**
   * True opens the record without its stored images instead of throwing, for a
   * caller that would rather show the text. Saving it later keeps the images.
   */
  tolerateFailure?: boolean;
}

/**
 * Move a record's image bytes into the image database, returning the copy to
 * write in their place. Do this before writing the record: a crash in between
 * leaves an unused image, never a record whose image is missing. Images saved
 * before the store existed are inline, and move on their next save. Bytes
 * already stored are left alone but marked as just used; ones a delete
 * elsewhere swept are written again. The check shares the write transaction,
 * so a sweep can't land between it and the write.
 * @param record - Record with inline images
 * @returns A copy whose images are refs
 */
export async function storeConversationImages<T extends WithMessages>(
  record: T,
): Promise<T> {
  const inline = new Map<string, string>();
  const mapped = mapImages(record, (image) => {
    if (isStoredImage(image)) {
      return image;
    }

    const ref = knownRefs.get(image) ?? hashImageData(image.data);

    knownRefs.set(image, ref);
    inline.set(ref, image.data);

    return { mediaType: image.mediaType, ref };
  });
  const stored = restoreUnreadImages(mapped);

  if (inline.size > 0) {
    await writeImages(inline);
  }

  return stored;
}

/**
 * Put a stored record's image bytes back. An image whose bytes are missing is
 * dropped: an empty one would fail the next model request. If the store can't
 * be read at all, this throws, or with `tolerateFailure` drops every stored
 * image the same way.
 * @param record - Record as read from the conversation store
 * @param options - What to do when the bytes can't be read
 * @returns A copy with inline images
 */
export async function loadConversationImages<T extends WithMessages>(
  record: T,
  options: LoadImagesOptions = {},
): Promise<T> {
  const refs = conversationImageRefs([record]);

  if (refs.size === 0) {
    return record;
  }

  const id = (record as { id?: unknown }).id;
  let bytes: Map<string, string | undefined>;

  try {
    bytes = await readImageBytes(refs);
  } catch (error) {
    if (!options.tolerateFailure) {
      throw error;
    }

    console.error("Failed to read conversation images", error);

    if (typeof id === "string") {
      unreadImages.set(id, record.messages);
    }

    return mapImages(record, (image) => (isStoredImage(image) ? null : image));
  }

  if (typeof id === "string") {
    unreadImages.delete(id);
  }

  return mapImages(record, (image) => {
    if (!isStoredImage(image)) {
      return image;
    }

    const data = bytes.get(image.ref);

    if (data == null) {
      return null;
    }

    const inline = { mediaType: image.mediaType, data };

    knownRefs.set(inline, image.ref);

    return inline;
  });
}

/**
 * Read image bytes from the image database.
 * @param refs - Refs to read
 * @returns Bytes by ref; undefined where nothing is stored
 */
async function readImageBytes(
  refs: Set<string>,
): Promise<Map<string, string | undefined>> {
  const db = await getImageDb();
  const store = db.transaction(IMAGE_STORE).store;
  const bytes = new Map<string, string | undefined>();

  for (const ref of refs) {
    bytes.set(ref, (await store.get(ref)) as string | undefined);
  }

  return bytes;
}

/**
 * Put back the image refs a conversation lost when it was opened without its
 * bytes. A message gets them back if it's still the same message (same role
 * and text) and has no images of its own.
 * @param record - Record about to be saved
 * @returns The record, with those refs restored
 */
function restoreUnreadImages<T extends WithMessages>(record: T): T {
  const id = (record as { id?: unknown }).id;
  const original = typeof id === "string" ? unreadImages.get(id) : undefined;

  if (original == null || !Array.isArray(record.messages)) {
    return record;
  }

  const messages = record.messages.map((message, i) => {
    const before = original.at(i) ?? null;
    const refs = storedImagesOf(before).filter(isStoredImage);

    return refs.length > 0 &&
      storedImagesOf(message).length === 0 &&
      before != null &&
      message.role === before.role &&
      message.content === before.content
      ? { ...message, images: refs as unknown as ChatImage[] }
      : message;
  });

  return { ...record, messages };
}

/**
 * Delete the images no remaining record uses and no save touched lately. Run
 * it after the transaction that removed or rewrote records, with the records
 * that transaction left. A save in another tab may add a reference after
 * those were read, which is what {@link SPARED_MS} covers. A failure is only
 * logged: the records are already written, and the next sweep retries.
 * @param records - Every record left in the conversation store
 */
export async function sweepConversationImages(
  records: WithMessages[],
): Promise<void> {
  try {
    const inUse = conversationImageRefs(records);
    const db = await getImageDb();
    const tx = db.transaction([IMAGE_STORE, TOUCHED_STORE], "readwrite");
    const images = tx.objectStore(IMAGE_STORE);
    const touched = tx.objectStore(TOUCHED_STORE);
    const touchedKeys = (await touched.getAllKeys()) as string[];
    const touchedTimes = (await touched.getAll()) as number[];
    const touchedAt = new Map(touchedKeys.map((k, i) => [k, touchedTimes[i]]));
    const cutoff = Date.now() - SPARED_MS;

    for (const ref of (await images.getAllKeys()) as string[]) {
      const at = touchedAt.get(ref);

      if (!inUse.has(ref) && (at == null || at < cutoff)) {
        void images.delete(ref);
        void touched.delete(ref);
      }
    }

    await tx.done;
  } catch (error) {
    console.error("Failed to remove unused images", error);
  }
}

/**
 * Delete every stored image, whatever was saved lately. For "delete all", where
 * the user expects nothing left. Run it after the records are gone. A failure
 * is only logged, like {@link sweepConversationImages}: the records are gone,
 * and a later sweep takes what is left.
 */
export async function clearConversationImages(): Promise<void> {
  try {
    const db = await getImageDb();
    const tx = db.transaction([IMAGE_STORE, TOUCHED_STORE], "readwrite");

    void tx.objectStore(IMAGE_STORE).clear();
    void tx.objectStore(TOUCHED_STORE).clear();
    await tx.done;
  } catch (error) {
    console.error("Failed to remove images", error);
  }
}

/**
 * Write image bytes that aren't stored yet and mark every one as just used.
 * @param inline - Bytes by ref
 */
async function writeImages(inline: Map<string, string>): Promise<void> {
  const db = await getImageDb();
  const tx = db.transaction([IMAGE_STORE, TOUCHED_STORE], "readwrite");
  const images = tx.objectStore(IMAGE_STORE);
  const touched = tx.objectStore(TOUCHED_STORE);
  const now = Date.now();

  for (const [ref, data] of inline) {
    if ((await images.getKey(ref)) == null) {
      void images.put(data, ref);
    }

    void touched.put(now, ref);
  }

  await tx.done;
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
