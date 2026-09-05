// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { act, renderHook } from "@testing-library/preact";
import { expect, vi } from "vitest";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import * as conversationDb from "#webui/lib/conversation-db";
import {
  listAllConversationSummaries,
  loadConversation,
} from "#webui/lib/conversation-db";
import {
  createConversationsProps,
  waitForEffects,
  useConversationsWithUndo,
} from "./use-conversations-test-helpers";

/** Marks the message the concurrent save is carrying, so the invariants can
 * find it wherever it lands. */
export const LATE_MARKER = "late-chunk-marker";

/** Where the concurrent save's DB write lands relative to the operation. */
export type Timing = "write-first" | "write-last";

export const TIMINGS: Timing[] = ["write-first", "write-last"];

/** The live hook plus the state the operations manipulate. */
export interface Handle {
  result: { current: ReturnType<typeof useConversationsWithUndo> };
  state: { chatHistory: unknown[] };
  pendingForkRef: { current: PendingFork | null };
}

/** How the conversation the concurrent save belongs to was set up. */
export interface SaveFlavor {
  name: string;
  /** Prepare the live conversation. Returns its id, or null when the save is
   * the one that mints it. */
  arrange: (handle: Handle) => Promise<string | null>;
  /** True when the racing save must NOT write into the conversation it started
   * from — a fork has to branch, not overwrite its source. */
  sparesLive?: boolean;
}

/** A conversation-changing operation raced against the concurrent save. */
export interface DestructiveOp {
  name: string;
  run: (handle: Handle, bystanderId: string) => Promise<void>;
  /** Whether this operation removes the live conversation's record. */
  destroysLive: boolean;
  /** Whether it also removes the untouched bystander conversation. */
  destroysBystander: boolean;
}

/** What an interleaving left behind, for op-specific assertions. */
export interface Outcome {
  /** Id of the live conversation, or null when the save minted it. */
  liveId: string | null;
  bystanderId: string;
  activeId: string | null;
  ids: string[];
}

/**
 * Race one save against one destructive operation and check the invariants
 * that must hold no matter how the two interleave.
 *
 * The point is composition: each guard in the save path is easy to check on its
 * own, and every bug so far has come from two of them meeting. Enumerating the
 * pairs is what a per-bug regression test can't do.
 * @param op - The destructive operation under test
 * @param flavor - How the racing save's conversation was set up
 * @param timing - Whether the save's write lands before or after the operation
 * @returns What the interleaving left behind
 */
export async function runInterleaving(
  op: DestructiveOp,
  flavor: SaveFlavor,
  timing: Timing,
): Promise<Outcome> {
  const handle = await setupInterleavingHook();
  const bystanderId = await seedBystander(handle);
  const liveId = await flavor.arrange(handle);
  const { release, restore } = gateNextSave();

  await act(async () => {
    // The delete paths drain the save chain before they touch the DB, so the
    // two timings can't just swap a release: enqueuing the save first and
    // holding its write would deadlock the drain against the test. Instead the
    // save either finishes before the operation starts, or is enqueued after
    // the operation is already running — which is the real shape of the race
    // anyway (a stream-teardown autosave firing during a delete).
    if (timing === "write-first") {
      const savePromise = startLateSave(handle);

      release();
      await savePromise;
      await op.run(handle, bystanderId);
    } else {
      const opPromise = op.run(handle, bystanderId);
      const savePromise = startLateSave(handle);

      await opPromise;
      release();
      await savePromise;
    }
  });

  await waitForEffects();
  restore();

  const summaries = await listAllConversationSummaries();
  const outcome: Outcome = {
    liveId,
    bystanderId,
    activeId: handle.result.current.activeConversationId,
    ids: summaries.map((summary) => summary.id),
  };

  await expectInvariants(op, flavor, outcome);

  return outcome;
}

/**
 * Fire the racing save, carrying the marker the invariants look for.
 * @param handle - The live hook
 * @returns The save's in-flight promise
 */
function startLateSave(handle: Handle): Promise<void> {
  handle.state.chatHistory = [{ role: "user", content: LATE_MARKER }];

  return handle.result.current.saveCurrentConversation(Date.now());
}

/**
 * Assert the three things that must hold after any save/operation interleaving.
 * @param op - The operation that ran, for what it was supposed to remove
 * @param flavor - How the racing save's conversation was set up
 * @param outcome - What the interleaving left behind
 */
async function expectInvariants(
  op: DestructiveOp,
  flavor: SaveFlavor,
  outcome: Outcome,
): Promise<void> {
  const { liveId, bystanderId, activeId, ids } = outcome;

  // 1. No resurrection. A record the operation removed stays removed, however
  //    late the racing write lands.
  if (op.destroysLive && liveId != null) expect(ids).not.toContain(liveId);

  if (op.destroysBystander) expect(ids).not.toContain(bystanderId);
  else expect(ids).toContain(bystanderId);

  // 2. No cross-contamination. The racing save's history lands in one record or
  //    none — never in a conversation that belongs to someone else. A first
  //    save and a fork both mint their id inside the save, so which record is
  //    legitimate isn't known up front; what is known is which ones are not.
  const carriers: string[] = [];

  for (const id of ids) {
    if (await conversationCarries(id, LATE_MARKER)) carriers.push(id);
  }

  expect(carriers.length).toBeLessThanOrEqual(1);
  expect(carriers).not.toContain(bystanderId);

  if (flavor.sparesLive && liveId != null) {
    expect(carriers).not.toContain(liveId);
  }

  // 3. The active conversation, the URL hash, and the store agree. A hash
  //    pointing at a record that isn't there strands the next reload.
  expect(hashId()).toBe(activeId);

  if (activeId != null) expect(ids).toContain(activeId);
}

/**
 * Render useConversations with a fork signal wired in and wait for init.
 * @returns The live hook, its chat-history state, and the fork ref
 */
export async function setupInterleavingHook(): Promise<Handle> {
  const { props, state } = createConversationsProps();
  const pendingForkRef = { current: null as PendingFork | null };

  // useChat's clearConversation drops the fork signal along with the client the
  // fork was built on. Mirror that, or the mock leaves a fork armed that the
  // real app would have discarded.
  const clearConversation = (): void => {
    pendingForkRef.current = null;
  };

  const { result } = renderHook(() =>
    useConversationsWithUndo({ ...props, clearConversation, pendingForkRef }),
  );

  await waitForEffects();

  return { result, state, pendingForkRef };
}

/**
 * Persist one unrelated conversation and leave it, so every operation has a
 * conversation it must not touch (or, for the sweeps, must take with it).
 * @param handle - The live hook
 * @returns Id of the bystander conversation
 */
async function seedBystander(handle: Handle): Promise<string> {
  const { result, state } = handle;

  await saveHistory(handle, "bystander");
  const id = result.current.activeConversationId;

  if (id == null) throw new Error("seedBystander: the save minted no id");

  await act(() => {
    result.current.startNewConversation();
  });
  state.chatHistory = [];

  return id;
}

/**
 * Set the chat history to one message and save it through the hook.
 * @param handle - The live hook
 * @param content - Message content to persist
 */
export async function saveHistory(
  handle: Handle,
  content: string,
): Promise<void> {
  handle.state.chatHistory = [{ role: "user", content }];
  await act(() => handle.result.current.saveCurrentConversation());
}

/**
 * Hold the next saveConversation write open until the test releases it, so the
 * caller decides whether it lands before or after the racing operation.
 * @returns Release (let the write proceed) and restore (drop the spy)
 */
export function gateNextSave(): { release: () => void; restore: () => void } {
  const original = conversationDb.saveConversation;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi
    .spyOn(conversationDb, "saveConversation")
    .mockImplementationOnce(async (record, options) => {
      await held;

      return await original(record, options);
    });

  return { release, restore: () => spy.mockRestore() };
}

/**
 * Whether a stored conversation's history contains the given text.
 * @param id - Conversation id to read
 * @param text - Text to look for
 * @returns True when the record's messages contain it
 */
export async function conversationCarries(
  id: string,
  text: string,
): Promise<boolean> {
  const record = await loadConversation(id);

  return JSON.stringify(record?.messages ?? []).includes(text);
}

/**
 * Read the conversation id out of the URL hash.
 * @returns The id, or null when the hash is empty
 */
function hashId(): string | null {
  return window.location.hash.replace(/^#/, "") || null;
}
