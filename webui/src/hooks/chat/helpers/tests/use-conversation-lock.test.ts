// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useConversationLock } from "#webui/hooks/chat/helpers/conversations/use-conversation-lock";

function createMockChat() {
  return {
    handleSend: vi.fn().mockResolvedValue(undefined),
    clearConversation: vi.fn(),
  };
}

/**
 * Render the hook over a fresh mock chat.
 * @returns The mock chat and the hook result
 */
function setup() {
  const chat = createMockChat();
  const { result } = renderHook(() => useConversationLock({ chat }));

  return { chat, result };
}

describe("useConversationLock", () => {
  it("returns the provided chat", () => {
    const { chat, result } = setup();

    expect(result.current.chat).toBe(chat);
  });

  it("delegates handleSend to chat", async () => {
    const { chat, result } = setup();

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });
    expect(chat.handleSend).toHaveBeenCalledWith("Hello", undefined);
  });

  it("delegates clearConversation to chat", async () => {
    const { chat, result } = setup();

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });

    await act(async () => {
      result.current.wrappedClearConversation();
    });
    expect(chat.clearConversation).toHaveBeenCalled();
  });

  it("passes message options to handleSend", async () => {
    const { chat, result } = setup();
    const options = { thinking: "Max" };

    await act(async () => {
      await result.current.wrappedHandleSend("Hello", options);
    });
    expect(chat.handleSend).toHaveBeenCalledWith("Hello", options);
  });
});
