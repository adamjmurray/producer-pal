// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { act } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as conversationDb from "#webui/lib/conversation-db";
import { openGate } from "#webui/test-utils/async-test-helpers";
import {
  resetConversationsTestState,
  saveWithMessage,
  setupConversationsHook,
  waitForEffects,
} from "./use-conversations-test-helpers";

/**
 * Make the next loadConversation wait until released, then load for real.
 * @returns release, and restore to undo the spy
 */
function gateNextLoad(): { release: () => void; restore: () => void } {
  const original = conversationDb.loadConversation;
  const [gate, release] = openGate();
  const spy = vi
    .spyOn(conversationDb, "loadConversation")
    .mockImplementationOnce(async (id) => {
      await gate;

      return await original(id);
    });

  return { release, restore: () => spy.mockRestore() };
}

type Handle = Awaited<ReturnType<typeof setupConversationsHook>>;

/**
 * Save two conversations and start a new chat, so neither is on screen.
 * @param handle - The hook under test
 * @returns The two ids
 */
async function saveTwo(handle: Handle): Promise<[string, string]> {
  const { state, result } = handle;

  await saveWithMessage(state, result, "first");
  const first = result.current.activeConversationId!;

  await act(() => {
    result.current.startNewConversation();
  });
  await saveWithMessage(state, result, "second");
  const second = result.current.activeConversationId!;

  await act(() => {
    result.current.startNewConversation();
  });
  vi.clearAllMocks();

  return [first, second];
}

describe("useConversations switch race", () => {
  beforeEach(async () => {
    await resetConversationsTestState();
  });

  it("shows the latest switch when an earlier one finishes loading last", async () => {
    const handle = await setupConversationsHook();
    const { props, result } = handle;
    const [first, second] = await saveTwo(handle);
    const { release, restore } = gateNextLoad();

    await act(async () => {
      const slow = result.current.switchConversation(first);

      await result.current.switchConversation(second);
      release();
      await slow;
    });
    restore();

    expect(result.current.activeConversationId).toBe(second);
    expect(props.restoreChatHistory).toHaveBeenCalledTimes(1);
    expect(props.restoreChatHistory.mock.calls[0]?.[0]).toStrictEqual([
      expect.objectContaining({ content: "second" }),
    ]);
  });

  it("keeps a switch made while the chat in the URL was loading", async () => {
    const handle = await setupConversationsHook();
    const [first, second] = await saveTwo(handle);
    const { release, restore } = gateNextLoad();

    window.location.hash = `#${first}`;

    const reopened = await setupConversationsHook();

    await act(async () => {
      await reopened.result.current.switchConversation(second);
      release();
      await waitForEffects();
    });
    restore();

    expect(reopened.result.current.activeConversationId).toBe(second);
    expect(reopened.props.restoreChatHistory).toHaveBeenCalledTimes(1);
  });

  it("stays on a new chat started while a switch was loading", async () => {
    const handle = await setupConversationsHook();
    const { props, result } = handle;
    const [first] = await saveTwo(handle);
    const { release, restore } = gateNextLoad();

    await act(async () => {
      const slow = result.current.switchConversation(first);

      result.current.startNewConversation();
      release();
      await slow;
    });
    restore();

    expect(result.current.activeConversationId).toBeNull();
    expect(props.restoreChatHistory).not.toHaveBeenCalled();
  });
});
