// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { FAILED_TOOL_RESULT_TEXT } from "#webui/chat/sdk/build-model-messages";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { saveConversation } from "#webui/lib/conversation-db";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";
import {
  createConversationsProps as createProps,
  waitForEffects,
  setupConversationsHook as setupHook,
  resetConversationsTestState,
} from "./use-conversations-test-helpers";

/**
 * An assistant turn saved mid-tool-call: the call is there, its result never
 * arrived because the page went away under it.
 * @returns A one-message history with one dangling tool call
 */
function danglingHistory(): ChatMessage[] {
  return [
    {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "call-1", name: "ppal-create-clip", args: {} }],
    },
  ];
}

/**
 * Persist a record holding the given history.
 * @param messages - The history to store
 * @returns The conversation id
 */
async function saveHistory(messages: ChatMessage[]): Promise<string> {
  const id = crypto.randomUUID();

  await saveConversation(createTestRecord({ id, messages }));

  return id;
}

/**
 * The history handed to restoreChatHistory by the most recent restore.
 * @param props - The mocked hook props
 * @returns The restored history
 */
function restoredHistory(
  props: ReturnType<typeof createProps>["props"],
): ChatMessage[] {
  return props.restoreChatHistory.mock.lastCall?.[0] as ChatMessage[];
}

describe("useConversations restore", () => {
  beforeEach(resetConversationsTestState);

  it("backfills a dangling tool call when restoring from the URL hash", async () => {
    const id = await saveHistory(danglingHistory());

    window.location.hash = id;

    const { props } = createProps();

    renderHook(() => useConversations(props));
    await waitForEffects();

    expect(restoredHistory(props)[0]?.toolResults).toStrictEqual([
      {
        id: "call-1",
        name: "ppal-create-clip",
        args: {},
        result: FAILED_TOOL_RESULT_TEXT,
        isError: false,
      },
    ]);
  });

  it("backfills a dangling tool call when switching conversations", async () => {
    const id = await saveHistory(danglingHistory());
    const { props, result } = await setupHook();

    await act(async () => {
      await result.current.switchConversation(id);
    });

    expect(restoredHistory(props)[0]?.toolResults?.[0]?.result).toBe(
      FAILED_TOOL_RESULT_TEXT,
    );
  });

  it("leaves a tool call that already has its result alone", async () => {
    const messages = danglingHistory();

    messages[0]!.toolResults = [
      {
        id: "call-1",
        name: "ppal-create-clip",
        args: {},
        result: "Created clip",
      },
    ];

    const id = await saveHistory(messages);
    const { props, result } = await setupHook();

    await act(async () => {
      await result.current.switchConversation(id);
    });

    expect(restoredHistory(props)[0]?.toolResults).toStrictEqual([
      {
        id: "call-1",
        name: "ppal-create-clip",
        args: {},
        result: "Created clip",
      },
    ]);
  });
});
