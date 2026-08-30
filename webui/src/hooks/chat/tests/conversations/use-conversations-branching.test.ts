// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import * as conversationDb from "#webui/lib/conversation-db";
import {
  listConversations,
  loadConversation,
} from "#webui/lib/conversation-db";
import {
  type ConversationsResult,
  type ConversationsState,
  createConversationsProps,
  resetConversationsTestState,
  waitForEffects,
  useConversationsWithUndo,
} from "./use-conversations-test-helpers";

/** The injectable pending-fork signal the hook consumes on save. */
type PendingForkRef = { current: PendingFork | null };

/**
 * Render useConversations with an injectable pending-fork signal.
 * @returns Hook result, the mutable chat-history state, and the fork ref
 */
async function setupForkHook() {
  const { props, state } = createConversationsProps();
  const pendingForkRef = { current: null as PendingFork | null };
  const { result } = renderHook(() =>
    useConversationsWithUndo({ ...props, pendingForkRef }),
  );

  await waitForEffects();

  return { result, state, pendingForkRef };
}

/**
 * Save the current chat history through the hook.
 * @param result - Hook result ref
 * @param state - Mutable chat-history state
 * @param history - Chat history to persist
 */
async function save(
  result: ConversationsResult,
  state: ConversationsState,
  history: { role: string; content: string }[],
): Promise<void> {
  state.chatHistory = history;
  await act(() => result.current.saveCurrentConversation());
}

/**
 * Render the hook and persist ORIGINAL as the trunk conversation.
 * @returns Hook result, chat-history state, the fork ref, and the trunk's id
 */
async function setupWithSavedOriginal() {
  const { result, state, pendingForkRef } = await setupForkHook();

  await save(result, state, ORIGINAL);
  const originalId = result.current.activeConversationId!;

  return { result, state, pendingForkRef, originalId };
}

/**
 * Raise the pending-fork signal, then save history as the forked sibling.
 * @param result - Hook result ref
 * @param state - Mutable chat-history state
 * @param pendingForkRef - Injected pending-fork signal ref
 * @param history - Chat history to persist as the fork
 * @param anchorIndex - Message index the fork branches from
 * @returns The active conversation id after the save
 */
async function saveAsFork(
  result: ConversationsResult,
  state: ConversationsState,
  pendingForkRef: PendingForkRef,
  history: { role: string; content: string }[],
  anchorIndex = 0,
): Promise<string> {
  pendingForkRef.current = { anchorIndex };
  await save(result, state, history);

  return result.current.activeConversationId!;
}

const ORIGINAL = [
  { role: "user", content: "original question" },
  { role: "assistant", content: "original answer" },
];
const FORKED = [
  { role: "user", content: "edited question" },
  { role: "assistant", content: "new answer" },
];

describe("useConversations branching", () => {
  beforeEach(resetConversationsTestState);

  it("forks into a new record and leaves the original intact", async () => {
    const { result, state, pendingForkRef, originalId } =
      await setupWithSavedOriginal();

    const forkId = await saveAsFork(result, state, pendingForkRef, FORKED);

    expect(forkId).not.toBe(originalId);
    expect(pendingForkRef.current).toBeNull(); // signal consumed

    const original = await loadConversation(originalId);
    const fork = await loadConversation(forkId);

    expect(original?.messages).toStrictEqual(ORIGINAL);
    expect(original?.forkParentId).toBeUndefined();
    expect(fork?.messages).toStrictEqual(FORKED);
    expect(fork?.forkParentId).toBe(originalId);
    expect(fork?.forkedAtIndex).toBe(0);
  });

  // The signal is consumed before the write is attempted, so a write that
  // throws left the branch uncreated and unbranchable: the retry took the plain
  // first-save path, with no link to the trunk and the trunk's own title and
  // bookmark copied onto it.
  it("still branches after the fork's first write fails", async () => {
    const { result, state, pendingForkRef, originalId } =
      await setupWithSavedOriginal();
    const failing = vi
      .spyOn(conversationDb, "saveConversation")
      .mockRejectedValueOnce(new Error("quota"));

    pendingForkRef.current = { anchorIndex: 0 };
    await save(result, state, FORKED);
    failing.mockRestore();

    expect(pendingForkRef.current).toStrictEqual({ anchorIndex: 0 });

    await save(result, state, FORKED);

    const forkId = result.current.activeConversationId!;
    const fork = await loadConversation(forkId);

    expect(forkId).not.toBe(originalId);
    expect(fork?.forkParentId).toBe(originalId);
    expect(fork?.forkedAtIndex).toBe(0);
  });

  it("keeps branch linkage on a later (post-response) save", async () => {
    const { result, state, pendingForkRef, originalId } =
      await setupWithSavedOriginal();

    const forkId = await saveAsFork(result, state, pendingForkRef, FORKED);

    // A normal save follows with no fork pending (e.g. the autosave after the
    // assistant finishes responding). It must not strip the branch fields.
    await save(result, state, [
      ...FORKED,
      { role: "assistant", content: "more" },
    ]);

    expect(result.current.activeConversationId).toBe(forkId);

    const fork = await loadConversation(forkId);

    expect(fork?.forkParentId).toBe(originalId);
    expect(fork?.forkedAtIndex).toBe(0);
    expect(await listConversations()).toHaveLength(1);
  });

  it("preserves branch linkage when a follow-up save is fired before the fork save resolves", async () => {
    const { result, state, pendingForkRef, originalId } =
      await setupWithSavedOriginal();

    // Fire the fork save and an immediate follow-up without awaiting the fork
    // save first. Serialized saves keep the read-after-write ordering, so the
    // follow-up still sees the persisted fork record and carries its linkage;
    // run concurrently, the follow-up's read could beat the fork save's write
    // and strip forkParentId/forkedAtIndex.
    pendingForkRef.current = { anchorIndex: 0 };
    await act(async () => {
      state.chatHistory = FORKED;
      const forkSave = result.current.saveCurrentConversation();

      state.chatHistory = [...FORKED, { role: "assistant", content: "more" }];
      const followUp = result.current.saveCurrentConversation();

      await Promise.all([forkSave, followUp]);
    });

    const forkId = result.current.activeConversationId!;

    expect(forkId).not.toBe(originalId);

    const fork = await loadConversation(forkId);

    expect(fork?.forkParentId).toBe(originalId);
    expect(fork?.forkedAtIndex).toBe(0);
    expect(fork?.messages).toStrictEqual([
      ...FORKED,
      { role: "assistant", content: "more" },
    ]);
    expect(await listConversations()).toHaveLength(1);
  });

  it("collapses the branch family to one list entry, represented by the active sibling", async () => {
    const { result, state, pendingForkRef } = await setupWithSavedOriginal();

    await saveAsFork(result, state, pendingForkRef, FORKED);

    // Pass the active id (as the hook's refreshList does) so the family is
    // represented by the sibling being viewed. This is also deterministic when
    // both saves land in the same millisecond — without it, equal timestamps
    // would let record insertion order pick the representative.
    const list = await listConversations(result.current.activeConversationId);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(result.current.activeConversationId);
  });

  it("attaches a re-fork at the same point to the original trunk", async () => {
    const {
      result,
      state,
      pendingForkRef,
      originalId: trunkId,
    } = await setupWithSavedOriginal();

    // First fork.
    const firstForkId = await saveAsFork(result, state, pendingForkRef, FORKED);

    // Re-fork the first fork at the same point: should share the trunk, not
    // chain off the first fork.
    const secondForkId = await saveAsFork(result, state, pendingForkRef, [
      { role: "user", content: "third take" },
    ]);

    const secondFork = await loadConversation(secondForkId);

    expect(secondForkId).not.toBe(firstForkId);
    expect(secondFork?.forkParentId).toBe(trunkId);
    expect(await listConversations()).toHaveLength(1);
  });

  it("degrades to a normal save when there is no source to fork from", async () => {
    const { result, state, pendingForkRef } = await setupForkHook();

    // Fork signal set with no active conversation (nothing saved yet).
    const savedId = await saveAsFork(result, state, pendingForkRef, ORIGINAL);

    const saved = await loadConversation(savedId);

    expect(saved?.forkParentId).toBeUndefined();
    expect(saved?.forkedAtIndex).toBeUndefined();
    expect(pendingForkRef.current).toBeNull();
  });

  it("keeps the fork signal on an empty-history save so the source can't be overwritten later", async () => {
    const { result, state, pendingForkRef, originalId } =
      await setupWithSavedOriginal();

    // A fork stopped before it streamed anything (edit the first message, then
    // Stop) reaches the save with empty history. Nothing is written, so nothing
    // consumes the signal...
    await saveAsFork(result, state, pendingForkRef, []);

    expect(pendingForkRef.current).toStrictEqual({ anchorIndex: 0 });
    expect(result.current.activeConversationId).toBe(originalId); // no new record

    // ...because the fork's client is still installed: the next save is that
    // fork continuing, so it branches instead of writing the truncated history
    // over the original.
    await save(result, state, FORKED);

    const forkId = result.current.activeConversationId;

    expect(forkId).not.toBe(originalId);

    const original = await loadConversation(originalId);

    expect(original?.messages).toStrictEqual(ORIGINAL);
    expect(pendingForkRef.current).toBeNull();
    expect(await listConversations()).toHaveLength(1); // one collapsed family
  });
});
