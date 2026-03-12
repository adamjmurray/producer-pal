// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useConversationLock } from "./use-conversation-lock";

function createMockChat() {
  return {
    handleSend: vi.fn().mockResolvedValue(undefined),
    clearConversation: vi.fn(),
  };
}

describe("useConversationLock", () => {
  it("returns the provided chat", () => {
    const chat = createMockChat();
    const { result } = renderHook(() => useConversationLock({ chat }));

    expect(result.current.chat).toBe(chat);
  });

  it("delegates handleSend to chat", async () => {
    const chat = createMockChat();
    const { result } = renderHook(() => useConversationLock({ chat }));

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });
    expect(chat.handleSend).toHaveBeenCalledWith("Hello", undefined);
  });

  it("delegates clearConversation to chat", async () => {
    const chat = createMockChat();
    const { result } = renderHook(() => useConversationLock({ chat }));

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });

    await act(async () => {
      result.current.wrappedClearConversation();
    });
    expect(chat.clearConversation).toHaveBeenCalled();
  });

  it("passes message options to handleSend", async () => {
    const chat = createMockChat();
    const { result } = renderHook(() => useConversationLock({ chat }));
    const options = { thinking: "Max", temperature: 0.5 };

    await act(async () => {
      await result.current.wrappedHandleSend("Hello", options);
    });
    expect(chat.handleSend).toHaveBeenCalledWith("Hello", options);
  });
});
