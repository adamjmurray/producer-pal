// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatImage, type ChatMessage } from "#webui/chat/sdk/types";
import {
  type ConversationRecord,
  deleteConversation,
  getConversationDb,
  loadAllConversations,
  loadConversation,
  saveConversation,
} from "#webui/lib/conversation-db";
import { exportConversation } from "#webui/lib/conversation-transfer";
import {
  getImageDb,
  resetImageDbCache,
} from "#webui/lib/conversations/image-db";
import {
  JPEG_IMAGE,
  PNG_IMAGE,
  failImageDbOpens,
  resetConversationDatabases,
} from "#webui/test-utils/conversation-image-test-helpers";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

const PNG = PNG_IMAGE;
const JPEG = JPEG_IMAGE;

type Stored = Record<string, unknown>;

/**
 * Write a record straight to the conversation store.
 * @param id - Record id
 * @param first - Fields of the first (user) message
 */
async function putRaw(id: string, first: Stored): Promise<void> {
  const db = await getConversationDb();

  await db.put(
    "conversations",
    createTestRecord({
      id,
      messages: [
        { role: "user", content: "match this", ...first } as ChatMessage,
        { role: "assistant", content: "ok" },
      ],
    }),
  );
}

/**
 * The first message of a record as stored, bypassing the image store.
 * @param id - Record id
 * @returns The stored message
 */
async function storedFirst(id: string): Promise<Stored> {
  const db = await getConversationDb();
  const raw = (await db.get("conversations", id)) as ConversationRecord;

  return raw.messages[0] as unknown as Stored;
}

/**
 * The first message of a conversation as the UI loads it.
 * @param id - Record id
 * @returns The loaded message
 */
async function loadedFirst(id: string): Promise<ChatMessage | undefined> {
  const record = await loadConversation(id);

  return record?.messages[0];
}

/**
 * The images of a conversation's first message as the UI loads them.
 * @param id - Record id
 * @returns The images
 */
async function imagesOf(id: string): Promise<ChatImage[] | undefined> {
  const first = await loadedFirst(id);

  return first?.images;
}

/**
 * The ref an image was stored under.
 * @param image - Image saved earlier
 * @returns Its ref
 */
async function refOf(image: ChatImage): Promise<{
  mediaType: string;
  ref: string;
}> {
  await saveConversation(
    createTestRecord({
      id: "seed",
      messages: [{ role: "user", content: "seed", images: [image] }],
    }),
  );

  const seeded = await storedFirst("seed");
  const [ref] = (seeded.imageRefs ?? []) as Array<{
    mediaType: string;
    ref: string;
  }>;

  await deleteConversation("seed");

  return ref!;
}

/**
 * Make every stored image look old, so a sweep may take it.
 */
async function ageImages(): Promise<void> {
  const db = await getImageDb();

  await db.clear("touched");
}

/**
 * How many images the image database holds.
 * @returns The count
 */
async function storedImageCount(): Promise<number> {
  const db = await getImageDb();

  return await db.count("images");
}

describe("image refs in stored messages", () => {
  beforeEach(async () => {
    await resetConversationDatabases();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves refs as imageRefs, with no images key", async () => {
    await saveConversation(
      createTestRecord({
        id: "a",
        messages: [{ role: "user", content: "x", images: [PNG, JPEG] }],
      }),
    );

    const first = await storedFirst("a");

    expect(first).not.toHaveProperty("images");
    expect(first.imageRefs).toStrictEqual([
      { mediaType: "image/png", ref: expect.any(String) },
      { mediaType: "image/jpeg", ref: expect.any(String) },
    ]);
  });

  it("writes neither key for a message left with no images", async () => {
    await saveConversation(
      createTestRecord({
        id: "a",
        messages: [{ role: "user", content: "x", images: [] }],
      }),
    );

    const first = await storedFirst("a");

    expect(first).not.toHaveProperty("images");
    expect(first).not.toHaveProperty("imageRefs");
  });

  it("is read without error by a UI that expects inline images", async () => {
    await saveConversation(
      createTestRecord({
        id: "a",
        messages: [{ role: "user", content: "x", images: [PNG] }],
      }),
    );

    const first = (await storedFirst("a")) as { images?: ChatImage[] };
    let bytes = 0;

    // What the released UI does when it builds a request.
    for (const image of first.images ?? []) {
      bytes += image.data.length;
    }

    expect(bytes).toBe(0);
  });

  it.each([
    ["imageRefs", (ref: unknown) => ({ imageRefs: [ref] })],
    ["refs inside images", (ref: unknown) => ({ images: [ref] })],
  ])("loads %s as inline images", async (_name, shape) => {
    const ref = await refOf(PNG);

    await putRaw("a", shape(ref));

    const first = await loadedFirst("a");

    expect(first?.images).toStrictEqual([PNG]);
    expect(first).not.toHaveProperty("imageRefs");
  });

  it("loads inline images written by the released UI", async () => {
    await putRaw("a", { images: [PNG] });

    const first = await loadedFirst("a");

    expect(first?.images).toStrictEqual([PNG]);
    expect(first).not.toHaveProperty("imageRefs");
  });

  it("loads imageRefs ahead of inline images, once each", async () => {
    const ref = await refOf(PNG);

    await putRaw("a", { imageRefs: [ref], images: [ref, JPEG] });

    expect(await imagesOf("a")).toStrictEqual([PNG, JPEG]);
  });

  it("drops a ref whose bytes are missing", async () => {
    await putRaw("a", { imageRefs: [{ mediaType: "image/png", ref: "nope" }] });

    expect(await imagesOf("a")).toStrictEqual([]);
  });

  it.each([
    ["refs inside images", (ref: unknown) => ({ images: [ref] })],
    ["inline images", () => ({ images: [PNG] })],
  ])("moves %s to imageRefs on the next save", async (_name, shape) => {
    const ref = await refOf(PNG);

    await putRaw("a", shape(ref));
    await saveConversation((await loadConversation("a"))!);

    const first = await storedFirst("a");

    expect(first).not.toHaveProperty("images");
    expect(first.imageRefs).toStrictEqual([ref]);
  });

  it("keeps a message's refs and inline images together on save", async () => {
    const ref = await refOf(PNG);

    await putRaw("a", { imageRefs: [ref], images: [JPEG] });
    await saveConversation((await loadConversation("a", { images: false }))!);

    const first = await storedFirst("a");

    expect(first).not.toHaveProperty("images");
    expect(first.imageRefs).toStrictEqual([
      ref,
      { mediaType: "image/jpeg", ref: expect.any(String) },
    ]);
    expect(await imagesOf("a")).toStrictEqual([PNG, JPEG]);
  });

  it("keeps bytes only imageRefs use when another conversation goes", async () => {
    const ref = await refOf(PNG);

    await putRaw("a", { imageRefs: [ref] });
    await putRaw("b", {});
    await ageImages();
    await deleteConversation("b");

    expect(await storedImageCount()).toBe(1);
    expect(await imagesOf("a")).toStrictEqual([PNG]);
  });

  it("keeps bytes only refs inside images use", async () => {
    const ref = await refOf(PNG);

    await putRaw("a", { images: [ref] });
    await putRaw("b", {});
    await ageImages();
    await deleteConversation("b");

    expect(await storedImageCount()).toBe(1);
  });

  it("sweeps bytes once the last record using them is deleted", async () => {
    const ref = await refOf(PNG);

    await putRaw("a", { imageRefs: [ref] });
    await ageImages();
    await deleteConversation("a");

    expect(await storedImageCount()).toBe(0);
  });

  it("restores a conversation's lost refs into imageRefs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const ref = await refOf(PNG);

    await putRaw("a", { images: [ref] });

    const spy = failImageDbOpens();

    await resetImageDbCache();

    const loaded = (await loadConversation("a", {
      tolerateImageFailure: true,
    }))!;

    spy.mockRestore();
    expect(loaded.messages[0]).not.toHaveProperty("imageRefs");
    await saveConversation({
      ...loaded,
      messages: [...loaded.messages, { role: "user", content: "more" }],
    });

    const first = await storedFirst("a");

    expect(first).not.toHaveProperty("images");
    expect(first.imageRefs).toStrictEqual([ref]);
  });

  it("exports images inline, never imageRefs", async () => {
    await saveConversation(
      createTestRecord({
        id: "a",
        messages: [{ role: "user", content: "x", images: [PNG] }],
      }),
    );

    const { json } = await exportConversation("a");
    const all = await loadAllConversations();

    expect(json).not.toContain("imageRefs");
    expect(json).toContain(PNG.data);
    expect(JSON.stringify(all)).not.toContain("imageRefs");
  });
});
