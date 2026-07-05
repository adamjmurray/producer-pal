// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoDelete } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  type ConversationRecord,
  getConversationDb,
  loadConversation,
  resetDbCache,
  saveConversation,
} from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

// Wrap saveConversation in a spy that delegates to the real fake-indexeddb
// implementation by default, so most tests exercise the real DB. Failure tests
// queue a one-off rejection via mockRejectedValueOnce.
vi.mock(import("#webui/lib/conversation-db"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, saveConversation: vi.fn(actual.saveConversation) };
});

/**
 * Build a minimal conversation record for undo tests.
 * @param overrides - Fields to override on the record
 * @returns A full conversation record
 */
function makeRecord(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return createTestRecord({ createdAt: 1000, updatedAt: 1000, ...overrides });
}

describe("useUndoDelete", () => {
  beforeEach(async () => {
    await resetDbCache();
    const db = await getConversationDb();

    await db.clear("conversations");
  });

  it("has no banner initially", () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));

    expect(result.current.undoNotification).toBeNull();
  });

  it("shows an undo banner naming the deleted conversation", async () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));

    await act(() =>
      result.current.pushDeleted(makeRecord({ title: "My Chat" })),
    );

    expect(result.current.undoNotification?.message).toBe("Deleted “My Chat”");
    expect(result.current.undoNotification?.type).toBe("warning");
    expect(result.current.undoNotification?.action?.label).toBe("Undo");
  });

  it("falls back to a timestamp label when the record has no title", async () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));

    await act(() => result.current.pushDeleted(makeRecord({ title: null })));

    expect(result.current.undoNotification?.message).toMatch(/^Deleted “.+”$/);
    expect(result.current.undoNotification?.message).not.toContain("null");
  });

  it("truncates long titles", async () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));
    const longTitle = "x".repeat(80);

    await act(() =>
      result.current.pushDeleted(makeRecord({ title: longTitle })),
    );

    const message = result.current.undoNotification?.message ?? "";

    expect(message).toContain("…");
    expect(message.length).toBeLessThan(longTitle.length);
  });

  it("restores the deleted record and refreshes on undo", async () => {
    const refreshList = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete(refreshList));
    const record = makeRecord({ title: "Restore me" });

    await act(() => result.current.pushDeleted(record));
    await act(() => result.current.undoNotification!.action!.onClick());

    await waitFor(async () => {
      const restored = await loadConversation(record.id);

      expect(restored?.title).toBe("Restore me");
    });
    expect(refreshList).toHaveBeenCalled();
    expect(result.current.undoNotification).toBeNull();
  });

  it("supports multi-level undo (history > 1) in LIFO order", async () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));
    const first = makeRecord({ title: "First" });
    const second = makeRecord({ title: "Second" });

    await act(() => result.current.pushDeleted(first));
    await act(() => result.current.pushDeleted(second));

    // Banner reflects the most recent deletion.
    expect(result.current.undoNotification?.message).toBe("Deleted “Second”");

    await act(() => result.current.undoNotification!.action!.onClick());

    // After undoing Second, it is restored and the banner reveals First.
    await waitFor(async () => {
      const restoredSecond = await loadConversation(second.id);

      expect(restoredSecond?.title).toBe("Second");
    });
    expect(result.current.undoNotification?.message).toBe("Deleted “First”");

    await act(() => result.current.undoNotification!.action!.onClick());

    await waitFor(async () => {
      const restoredFirst = await loadConversation(first.id);

      expect(restoredFirst?.title).toBe("First");
    });
    expect(result.current.undoNotification).toBeNull();
  });

  it("keeps the record and shows a retryable error when the restore save fails", async () => {
    // A failed save must NOT lose the conversation: the DB row was already
    // deleted, so the stack is its only copy. The banner turns into an error and
    // the record stays put so the user can retry.
    vi.mocked(saveConversation).mockRejectedValueOnce(
      new DOMException("full", "QuotaExceededError"),
    );
    const refreshList = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete(refreshList));
    const record = makeRecord({ title: "Keep me" });

    await act(() => result.current.pushDeleted(record));
    await act(() => result.current.undoNotification!.action!.onClick());

    // onClick fires `void undo()`, so wait for the rejected save to flush.
    await waitFor(() =>
      expect(result.current.undoNotification?.type).toBe("error"),
    );
    expect(result.current.undoNotification?.message).toMatch(
      /storage is full/i,
    );
    expect(result.current.undoNotification?.action?.label).toBe("Retry");
    expect(refreshList).not.toHaveBeenCalled();
    expect(await loadConversation(record.id)).toBeUndefined();

    // Retry now succeeds (the one-off rejection is consumed): the record is
    // restored and the banner clears.
    await act(() => result.current.undoNotification!.action!.onClick());

    await waitFor(async () => {
      expect(await loadConversation(record.id)).toBeDefined();
    });
    expect(refreshList).toHaveBeenCalled();
    expect(result.current.undoNotification).toBeNull();
  });

  it("clears a prior restore error when a new deletion is pushed", async () => {
    vi.mocked(saveConversation).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useUndoDelete(vi.fn()));

    await act(() => result.current.pushDeleted(makeRecord({ title: "First" })));
    await act(() => result.current.undoNotification!.action!.onClick());

    await waitFor(() =>
      expect(result.current.undoNotification?.type).toBe("error"),
    );

    await act(() =>
      result.current.pushDeleted(makeRecord({ title: "Second" })),
    );

    // A fresh deletion resets the banner to a normal warning.
    expect(result.current.undoNotification?.type).toBe("warning");
    expect(result.current.undoNotification?.message).toBe("Deleted “Second”");
    expect(result.current.undoNotification?.action?.label).toBe("Undo");
  });

  it("dismiss drops all pending undos without restoring", async () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));

    await act(() => result.current.pushDeleted(makeRecord({ title: "A" })));
    await act(() => result.current.pushDeleted(makeRecord({ title: "B" })));

    await act(() => result.current.dismissUndoNotification());

    expect(result.current.undoNotification).toBeNull();
  });

  it("undo is a no-op when the stack was emptied before a stale click fires", async () => {
    const refreshList = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoDelete(refreshList));

    await act(() => result.current.pushDeleted(makeRecord({ title: "Gone" })));

    // Capture the banner's undo handler, then dismiss so the stack is empty.
    const staleUndo = result.current.undoNotification!.action!.onClick;

    await act(() => result.current.dismissUndoNotification());

    // Firing the captured handler now must bail on the empty stack.
    await act(async () => {
      staleUndo();
      await Promise.resolve();
    });

    expect(vi.mocked(saveConversation)).not.toHaveBeenCalled();
    expect(refreshList).not.toHaveBeenCalled();
  });

  it("caps retained history at 10 deletions", async () => {
    const { result } = renderHook(() => useUndoDelete(vi.fn()));
    const records = Array.from({ length: 12 }, (_, i) =>
      makeRecord({ title: `conv-${i}` }),
    );

    for (const record of records) {
      await act(() => result.current.pushDeleted(record));
    }

    // Undo all retained records; only the last 10 should be restorable.
    for (let i = 0; i < 12; i++) {
      const notif = result.current.undoNotification;

      if (!notif) break;

      await act(() => notif.action!.onClick());
      await waitFor(() =>
        expect(result.current.undoNotification).not.toBe(notif),
      );
    }

    // The two oldest were evicted from the in-memory stack, never restored.
    expect(await loadConversation(records[0]!.id)).toBeUndefined();
    expect(await loadConversation(records[1]!.id)).toBeUndefined();
    expect(await loadConversation(records[2]!.id)).toBeDefined();
    expect(await loadConversation(records[11]!.id)).toBeDefined();
  });
});
