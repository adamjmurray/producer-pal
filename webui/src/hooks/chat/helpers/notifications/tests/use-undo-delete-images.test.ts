// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { useUndoDelete } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  type ConversationRecord,
  loadConversation,
  saveConversation,
} from "#webui/lib/conversation-db";
import {
  getImageDb,
  resetImageDbCache,
} from "#webui/lib/conversations/image-db";
import {
  PNG_IMAGE,
  failImageDbOpens,
  resetConversationDatabases,
} from "#webui/test-utils/conversation-image-test-helpers";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

/**
 * Save a conversation with an image, leaving the image database unreadable.
 * @returns The spy that fails image database opens
 */
async function saveThenBreakImages(): Promise<ReturnType<typeof vi.spyOn>> {
  await saveConversation(
    createTestRecord({
      id: "a",
      messages: [{ role: "user", content: "look", images: [PNG_IMAGE] }],
    }),
  );
  await resetImageDbCache();

  return failImageDbOpens();
}

/**
 * Make a sweep's age check pass, so an unused image may be deleted.
 */
async function ageImages(): Promise<void> {
  const db = await getImageDb();

  await db.clear("touched");
}

/**
 * @returns How many image blobs are stored
 */
async function storedImageCount(): Promise<number> {
  const db = await getImageDb();

  return await db.count("images");
}

/**
 * Save another conversation, which sweeps images no stored record uses.
 */
async function sweepViaSave(): Promise<void> {
  await ageImages();
  await saveConversation(createTestRecord({ id: "other" }));
}

describe("useUndoDelete while the image database can't be read", () => {
  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await resetConversationDatabases();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("still deletes, and undo brings the images back", async () => {
    const spy = await saveThenBreakImages();
    const { result } = renderHook(() => useUndoDelete());

    await act(() => result.current.deleteWithUndo("a"));
    expect(await loadConversation("a", { images: false })).toBeUndefined();
    expect(result.current.undoNotification).not.toBeNull();

    spy.mockRestore();
    // Another save sweeps; the deleted conversation's image must survive it.
    await sweepViaSave();
    await act(() => result.current.undoNotification!.action!.onClick());
    await waitForHookState(() =>
      expect(result.current.undoNotification).toBeNull(),
    );

    const restored = (await loadConversation("a")) as ConversationRecord;

    expect(restored.messages[0]?.images).toStrictEqual([PNG_IMAGE]);
  });

  it("undoes while the database is still unreadable", async () => {
    await saveThenBreakImages();

    const { result } = renderHook(() => useUndoDelete());

    await act(() => result.current.deleteWithUndo("a"));
    await act(() => result.current.undoNotification!.action!.onClick());

    await waitForHookState(() =>
      expect(result.current.undoNotification).toBeNull(),
    );
    expect(await loadConversation("a", { images: false })).toBeDefined();
  });

  it("lets a sweep take the images once the undo is dismissed", async () => {
    const spy = await saveThenBreakImages();
    const { result } = renderHook(() => useUndoDelete());

    await act(() => result.current.deleteWithUndo("a"));
    await act(() => result.current.dismissUndoNotification());
    spy.mockRestore();
    await sweepViaSave();

    expect(await storedImageCount()).toBe(0);
  });

  it("keeps the images only while the record is among the last ten deleted", async () => {
    const spy = await saveThenBreakImages();
    const { result } = renderHook(() => useUndoDelete());

    await act(() => result.current.deleteWithUndo("a"));

    // Ten more deletions push it off the undo stack.
    for (let i = 0; i < 10; i++) {
      await act(() =>
        result.current.pushDeleted(createTestRecord({ id: `x${i}` })),
      );
    }

    spy.mockRestore();
    await sweepViaSave();

    expect(await storedImageCount()).toBe(0);
  });

  it("doesn't pin the images when the delete fails", async () => {
    const spy = await saveThenBreakImages();
    const { result } = renderHook(() => useUndoDelete());

    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementationOnce(() => {
      throw new Error("delete failed");
    });
    await expect(act(() => result.current.deleteWithUndo("a"))).rejects.toThrow(
      "delete failed",
    );
    expect(await loadConversation("a", { images: false })).toBeDefined();
    expect(result.current.undoNotification).toBeNull();

    spy.mockRestore();
    await act(() => result.current.deleteWithUndo("a"));
    await act(() => result.current.dismissUndoNotification());
    await sweepViaSave();

    expect(await storedImageCount()).toBe(0);
  });
});
