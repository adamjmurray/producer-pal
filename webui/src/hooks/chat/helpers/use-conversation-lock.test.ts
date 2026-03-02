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
import { type Provider } from "#webui/types/settings";

function createMockChat() {
  return {
    handleSend: vi.fn().mockResolvedValue(undefined),
    clearConversation: vi.fn(),
  };
}

describe("useConversationLock", () => {
  it("returns the provided chat", () => {
    const chat = createMockChat();
    const { result } = renderHook(() =>
      useConversationLock({ settingsProvider: "gemini", chat }),
    );

    expect(result.current.chat).toBe(chat);
  });

  it("locks to provider on first message", async () => {
    const chat = createMockChat();
    const { result } = renderHook(
      ({ provider }: { provider: Provider }) =>
        useConversationLock({ settingsProvider: provider, chat }),
      { initialProps: { provider: "gemini" as Provider } },
    );

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });
    expect(chat.handleSend).toHaveBeenCalledWith("Hello", undefined);
  });

  it("clears lock on clearConversation", async () => {
    const chat = createMockChat();
    const { result } = renderHook(() =>
      useConversationLock({ settingsProvider: "gemini", chat }),
    );

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
    const { result } = renderHook(() =>
      useConversationLock({ settingsProvider: "gemini", chat }),
    );
    const options = { thinking: "High", temperature: 0.5 };

    await act(async () => {
      await result.current.wrappedHandleSend("Hello", options);
    });
    expect(chat.handleSend).toHaveBeenCalledWith("Hello", options);
  });
});
