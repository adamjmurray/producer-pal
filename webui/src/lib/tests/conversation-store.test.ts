// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createConversationStore } from "#webui/lib/conversation-store";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

describe("createConversationStore", () => {
  it("hides a brand-new conversation's id until a save claims it", () => {
    const store = createConversationStore();

    expect(store.activeId()).toBeNull();

    const snapshot = store.beginSave(false);

    // The id existed all along — the save didn't mint it, it published it.
    expect(snapshot?.id).toBeDefined();
    expect(store.activeId()).toBe(snapshot?.id);
  });

  it("starts on the conversation the URL hash names", () => {
    const store = createConversationStore("from-the-hash");

    expect(store.activeId()).toBe("from-the-hash");
    expect(store.beginSave(false)?.expectPersisted).toBe(true);
  });

  it("expects a row only once a write has landed", () => {
    const store = createConversationStore();
    const first = store.beginSave(false)!;

    expect(first.expectPersisted).toBe(false);

    store.markPersisted(first, createTestRecord({ id: first.id }));

    expect(store.beginSave(false)?.expectPersisted).toBe(true);
  });

  it("continues the claimed record before its first write lands", () => {
    // A follow-up fired while the first save is still queued has no row to
    // check, but it is still the same conversation and must read that record
    // back once the queue gets to it.
    const store = createConversationStore();
    const first = store.beginSave(false)!;
    const followUp = store.beginSave(false)!;

    expect(followUp.id).toBe(first.id);
    expect(followUp.reuseId).toBe(first.id);
    expect(followUp.expectPersisted).toBe(false);
  });

  it("branches a fork onto a new conversation, keeping the source", () => {
    const store = createConversationStore();
    const first = store.beginSave(false)!;
    const fork = store.beginSave(true)!;

    expect(fork.id).not.toBe(first.id);
    expect(fork.reuseId).toBe(first.id);
    expect(store.activeId()).toBe(fork.id);
  });

  it("degrades a fork with nothing saved to branch from into a plain save", () => {
    const store = createConversationStore();
    const fork = store.beginSave(true)!;

    expect(fork.reuseId).toBeNull();
  });

  it("refuses to start a save for a conversation being deleted", () => {
    const store = createConversationStore();

    store.beginSave(false);
    store.markDeleted();

    expect(store.activeId()).toBeNull();
    expect(store.beginSave(false)).toBeNull();
  });

  it("does not revive a conversation being deleted when its write lands", () => {
    // The delete drains the queue, so a write it is already waiting for can
    // finish after the slot is marked. Adopting it would republish an id the
    // delete is about to remove.
    const store = createConversationStore();
    const snapshot = store.beginSave(false)!;

    store.markDeleted();
    store.markPersisted(snapshot, createTestRecord({ id: snapshot.id }));

    expect(store.activeId()).toBeNull();
    expect(store.beginSave(false)).toBeNull();
  });

  it("keeps the live id stable until the conversation moves on", () => {
    const store = createConversationStore();
    const before = store.liveId();

    store.beginSave(false);

    expect(store.liveId()).toBe(before);

    store.reset();

    expect(store.liveId()).not.toBe(before);
  });

  it("puts the conversation back when a delete fails", () => {
    const store = createConversationStore();
    const first = store.beginSave(false)!;
    const undo = store.markDeleted();

    undo();

    expect(store.activeId()).toBe(first.id);
    expect(store.beginSave(false)?.id).toBe(first.id);
  });

  it("leaves a fresh conversation alone when a stale delete undo fires", () => {
    const store = createConversationStore();

    store.beginSave(false);

    const undo = store.markDeleted();

    store.reset();

    const after = store.activeId();

    undo();

    expect(store.activeId()).toBe(after);
  });

  it("ignores a write that landed for a conversation the user has left", () => {
    const store = createConversationStore();
    const left = store.beginSave(false)!;

    store.reset();
    store.markPersisted(left, createTestRecord({ id: left.id, title: "Left" }));

    expect(store.metaRef.current).toBeNull();
    expect(store.activeId()).toBeNull();
  });

  it("adopts an existing conversation and its metadata", () => {
    const store = createConversationStore();
    const record = createTestRecord({ title: "Adopted", bookmarked: true });

    store.adopt(record);

    expect(store.activeId()).toBe(record.id);
    expect(store.metaRef.current?.title).toBe("Adopted");
    expect(store.metaRef.current?.bookmarked).toBe(true);
  });

  it("announces only the changes to what the sidebar shows", () => {
    const store = createConversationStore();
    const listener = vi.fn();

    store.onActiveIdChange(listener);

    const snapshot = store.beginSave(false)!;

    expect(listener).toHaveBeenCalledWith(snapshot.id);

    store.markPersisted(snapshot, createTestRecord({ id: snapshot.id }));

    // Already published — going from claimed to persisted changes nothing here.
    expect(listener).toHaveBeenCalledTimes(1);

    store.reset();
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("works before a listener is registered", () => {
    const store = createConversationStore();

    expect(() => store.beginSave(false)).not.toThrow();
  });

  it("runs queued work in order and drains it", async () => {
    const store = createConversationStore();
    const order: string[] = [];

    const first = store.enqueue(async () => {
      await Promise.resolve();
      order.push("first");
    });
    const second = store.enqueue(() => {
      order.push("second");

      return Promise.resolve();
    });

    await store.drain();
    await Promise.all([first, second]);

    expect(order).toStrictEqual(["first", "second"]);
  });

  it("kills a save that shares a fork's id once the fork rolls back", () => {
    // A tool step's autosave can fire while a fork's first write is still in
    // flight. Since the fork claimed the id first, that autosave reads it
    // back as a plain continuation (reuseId === the fork's id). If the fork's
    // write then fails and rolls back, that queued continuation must not be
    // able to write under the dead id — it would land as an orphaned record
    // with no branch linkage.
    const store = createConversationStore();
    const trunk = store.beginSave(false)!;

    store.markPersisted(trunk, createTestRecord({ id: trunk.id }));

    const fork = store.beginSave(true)!;
    const followUp = store.beginSave(false)!;

    expect(followUp.id).toBe(fork.id);
    expect(followUp.reuseId).toBe(fork.id);
    expect(fork.stillLive()).toBe(true);
    expect(followUp.stillLive()).toBe(true);

    fork.rollback();

    expect(fork.stillLive()).toBe(false);
    expect(followUp.stillLive()).toBe(false);
    expect(store.activeId()).toBe(trunk.id);
    expect(store.liveId()).toBe(trunk.id);
  });

  it("leaves an unrelated save's id alone when a fork rolls back", () => {
    const store = createConversationStore();
    const trunk = store.beginSave(false)!;

    store.markPersisted(trunk, createTestRecord({ id: trunk.id }));

    const fork = store.beginSave(true)!;

    fork.rollback();

    // The retry after rollback claims a fresh id and must start out live.
    const retry = store.beginSave(true)!;

    expect(retry.id).not.toBe(fork.id);
    expect(retry.stillLive()).toBe(true);
  });

  it("keeps running queued work after one fails, and drain stays resolved", async () => {
    const store = createConversationStore();
    const order: string[] = [];

    const failed = store.enqueue(() => Promise.reject(new Error("db full")));

    await expect(failed).rejects.toThrow("db full");

    await store.enqueue(() => {
      order.push("after");

      return Promise.resolve();
    });

    await expect(store.drain()).resolves.toBeUndefined();
    expect(order).toStrictEqual(["after"]);
  });
});
