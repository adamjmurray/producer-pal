// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { renderHook, act } from "@testing-library/preact";
import { vi } from "vitest";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { getConversationDb, resetDbCache } from "#webui/lib/conversation-db";
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
      activeModel: null as string | null,
      activeProvider: null as Provider | null,
      activeThinking: null as string | null,
      activeTemperature: null as number | null,
      activeShowThoughts: null as boolean | null,
      activeSmallModelMode: null as boolean | null,
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
