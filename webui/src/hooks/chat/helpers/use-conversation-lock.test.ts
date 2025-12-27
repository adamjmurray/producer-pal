/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useConversationLock } from "./use-conversation-lock";
import type { Provider } from "#webui/types/settings";

function createMockChat(name: string) {
  return {
    name,
    handleSend: vi.fn().mockResolvedValue(undefined),
    clearConversation: vi.fn(),
  };
}

describe("useConversationLock", () => {
  it("uses settingsProvider initially", () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result } = renderHook(() =>
      useConversationLock({
        settingsProvider: "gemini",
        geminiChat,
        openaiChat,
      }),
    );

    expect(result.current.chat.name).toBe("gemini");
  });

  it("locks to provider on first message", async () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result, rerender } = renderHook(
      ({ provider }: { provider: Provider }) =>
        useConversationLock({
          settingsProvider: provider,
          geminiChat,
          openaiChat,
        }),
      { initialProps: { provider: "gemini" as Provider } },
    );

    // Send first message
    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });

    expect(geminiChat.handleSend).toHaveBeenCalledWith("Hello", undefined);

    // Change settings provider
    rerender({ provider: "openai" });

    // Should still be locked to gemini
    expect(result.current.chat.name).toBe("gemini");
  });

  it("uses new provider after settings change if no messages sent", () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result, rerender } = renderHook(
      ({ provider }: { provider: Provider }) =>
        useConversationLock({
          settingsProvider: provider,
          geminiChat,
          openaiChat,
        }),
      { initialProps: { provider: "gemini" as Provider } },
    );

    expect(result.current.chat.name).toBe("gemini");

    // Change settings without sending a message
    rerender({ provider: "openai" });

    // Should switch to openai since no lock
    expect(result.current.chat.name).toBe("openai");
  });

  it("clears lock on clearConversation", async () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result, rerender } = renderHook(
      ({ provider }: { provider: Provider }) =>
        useConversationLock({
          settingsProvider: provider,
          geminiChat,
          openaiChat,
        }),
      { initialProps: { provider: "gemini" as Provider } },
    );

    // Send message to lock provider
    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });

    // Change settings
    rerender({ provider: "openai" });
    expect(result.current.chat.name).toBe("gemini"); // Still locked

    // Clear conversation
    await act(async () => {
      result.current.wrappedClearConversation();
    });

    expect(geminiChat.clearConversation).toHaveBeenCalled();

    // Now should use new settings provider
    expect(result.current.chat.name).toBe("openai");
  });

  it("passes message options to handleSend", async () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result } = renderHook(() =>
      useConversationLock({
        settingsProvider: "gemini",
        geminiChat,
        openaiChat,
      }),
    );

    const options = { thinking: "High", temperature: 0.5 };

    await act(async () => {
      await result.current.wrappedHandleSend("Hello", options);
    });

    expect(geminiChat.handleSend).toHaveBeenCalledWith("Hello", options);
  });

  it("routes to openai when settingsProvider is openai", () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result } = renderHook(() =>
      useConversationLock({
        settingsProvider: "openai",
        geminiChat,
        openaiChat,
      }),
    );

    expect(result.current.chat.name).toBe("openai");
  });

  it("routes non-gemini providers to openai chat", () => {
    const geminiChat = createMockChat("gemini");
    const openaiChat = createMockChat("openai");

    const { result } = renderHook(() =>
      useConversationLock({
        settingsProvider: "openrouter",
        geminiChat,
        openaiChat,
      }),
    );

    expect(result.current.chat.name).toBe("openai");
  });
});
