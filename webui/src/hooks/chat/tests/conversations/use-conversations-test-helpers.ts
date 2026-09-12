// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { renderHook, act } from "@testing-library/preact";
import { vi } from "vitest";
import { type Notation } from "#src/shared/notation";
import { useUndoDelete } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import {
  type UseConversationsReturn,
  useConversations,
} from "#webui/hooks/chat/use-conversations";
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
        | ((record: ConversationRecord) => void)
        | undefined,
    },
  };
}

/** useConversations props minus the undo stack the wrapper below supplies. */
type ConversationsProps = Omit<
  Parameters<typeof useConversations>[0],
  "undoDelete"
>;

/**
 * Render useConversations with its own undo stack, which App owns in
 * production. Tests drive the hook directly, so they mint one here.
 * @param props - useConversations props, minus the undo stack
 * @returns The conversation manager
 */
export function useConversationsWithUndo(
  props: ConversationsProps,
): UseConversationsReturn {
  return useConversations({ ...props, undoDelete: useUndoDelete() });
}

/** The mutable chat-history state createConversationsProps hands back. */
export type ConversationsState = { chatHistory: unknown[] };

/** renderHook's result ref for a rendered useConversations. */
export type ConversationsResult = { current: UseConversationsReturn };

/** Wait for async effects to settle. */
export async function waitForEffects(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

export { fireHashChange } from "#webui/test-utils/dom-test-helpers";

/**
 * Create props, render hook, and wait for init.
 * @returns Props, state, and hook result
 */
export async function setupConversationsHook() {
  const { props, state } = createConversationsProps();
  const { result } = renderHook(() => useConversationsWithUndo(props));

  await waitForEffects();

  return { props, state, result };
}

/** The injectable pending-fork signal the hook consumes on save. */
export type PendingForkRef = { current: PendingFork | null };

/**
 * Create props, render the hook with an injectable pending-fork signal, and
 * wait for init.
 * @returns Props, state, hook result, and the fork ref
 */
export async function setupForkHook() {
  const { props, state } = createConversationsProps();
  const pendingForkRef: PendingForkRef = { current: null };
  const { result } = renderHook(() =>
    useConversationsWithUndo({ ...props, pendingForkRef }),
  );

  await waitForEffects();

  return { props, state, result, pendingForkRef };
}

/**
 * Set chat history and save the current conversation.
 * @param state - Mock state object with chatHistory
 * @param result - Hook result ref with saveCurrentConversation
 * @param content - Message content (default "hello")
 */
export async function saveWithMessage(
  state: ConversationsState,
  result: ConversationsResult,
  content = "hello",
): Promise<void> {
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
  state: ConversationsState,
  result: ConversationsResult,
  title: string,
): Promise<string> {
  await saveWithMessage(state, result);
  const id = result.current.activeConversationId;

  if (id == null) {
    throw new Error("saveAndRename: the save did not set a conversation id");
  }

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
