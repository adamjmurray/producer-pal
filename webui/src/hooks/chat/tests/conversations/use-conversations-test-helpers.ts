// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { renderHook, act } from "@testing-library/preact";
import { vi } from "vitest";
import { type Notation } from "#src/shared/notation";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import {
  type ConversationRecord,
  getConversationDb,
  resetDbCache,
} from "#webui/lib/conversation-db";
import { type Provider } from "#webui/types/settings";

/**
 * Creates default props for useConversations tests.
 * @returns Props with vi.fn() mocks and an updatable chatHistory
 */
export function createConversationsProps() {
  const state = { chatHistory: [] as unknown[] };

  return {
    state,
    props: {
      getChatHistory: vi.fn(() => state.chatHistory),
      restoreChatHistory: vi.fn(),
      clearConversation: vi.fn(),
      activeMeta: {
        activeModel: null as string | null,
        activeProvider: null as Provider | null,
        activeThinking: null as string | null,
        activeSmallModelMode: null as boolean | null,
        activeSystemInstruction: null as string | null,
        activeNotation: null as Notation | null,
        activeEnabledTools: null as Record<string, boolean> | null,
      },
      onForeignRecord: undefined as
        ((record: ConversationRecord) => void) | undefined,
    },
  };
}

/** Wait for async effects to settle. */
export async function waitForEffects(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

/**
 * Poll until `predicate` holds, flushing renders between attempts.
 *
 * Use this — not `waitFor` — when the assertion reads hook state through
 * `result.current`. preact testing-library runs the whole of `waitFor` inside a
 * single `act()`, which defers re-renders until it returns, so `result.current`
 * stays frozen at its pre-`waitFor` value for every poll and the condition can
 * never come true. (`waitFor` is still right for polling the DB directly, which
 * act batching doesn't touch.) A single fixed-length {@link waitForEffects} is
 * the other trap: it silently under-waits when a loaded CI runner takes longer
 * than one tick to settle.
 * @param predicate - Returns true once the awaited state has landed
 * @param timeoutMs - How long to keep polling before failing
 */
export async function waitForHookState(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for hook state`);
    }

    await waitForEffects();
  }
}

export { fireHashChange } from "#webui/test-utils/dom-test-helpers";

/**
 * Create props, render hook, and wait for init.
 * @returns Props, state, and hook result
 */
export async function setupConversationsHook() {
  const { props, state } = createConversationsProps();
  const { result } = renderHook(() => useConversations(props));

  await waitForEffects();

  return { props, state, result };
}

/**
 * Set chat history and save the current conversation.
 * @param state - Mock state object with chatHistory
 * @param result - Hook result ref with saveCurrentConversation
 * @param content - Message content (default "hello")
 */
export async function saveWithMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  state: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  result: any,
  content = "hello",
) {
  state.chatHistory = [{ role: "user", content }];
  await act(() => result.current.saveCurrentConversation());
}

/**
 * Save a message and rename the resulting conversation.
 * @param state - Mock state object with chatHistory
 * @param result - Hook result ref
 * @param title - New title to assign
 * @returns The conversation ID
 */
export async function saveAndRename(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  state: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper with loose typing
  result: any,
  title: string,
): Promise<string> {
  await saveWithMessage(state, result);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper assumes conversation was saved
  const id = result.current.activeConversationId!;

  await act(async () => {
    await result.current.renameConversation(id, title);
  });

  return id;
}

/**
 * Common beforeEach for useConversations tests: reset DB, clear hash/storage/mocks.
 */
export async function resetConversationsTestState(): Promise<void> {
  await resetDbCache();
  const db = await getConversationDb();

  await db.clear("conversations");
  window.location.hash = "";
  localStorage.clear();
  vi.clearAllMocks();
}
