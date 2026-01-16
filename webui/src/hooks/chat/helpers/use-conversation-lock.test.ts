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

function renderConversationLock(initialProvider: Provider = "gemini") {
  const geminiChat = createMockChat("gemini");
  const openaiChat = createMockChat("openai");
  const responsesChat = createMockChat("responses");
  const hook = renderHook(
    ({ provider }: { provider: Provider }) =>
      useConversationLock({
        settingsProvider: provider,
        geminiChat,
        openaiChat,
        responsesChat,
      }),
    { initialProps: { provider: initialProvider } },
  );

  return { ...hook, geminiChat, openaiChat, responsesChat };
}

describe("useConversationLock", () => {
  it("uses settingsProvider initially", () => {
    const { result } = renderConversationLock("gemini");

    expect(result.current.chat.name).toBe("gemini");
  });

  it("locks to provider on first message", async () => {
    const { result, rerender, geminiChat } = renderConversationLock("gemini");

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });
    expect(geminiChat.handleSend).toHaveBeenCalledWith("Hello", undefined);

    rerender({ provider: "openai" });
    expect(result.current.chat.name).toBe("gemini"); // Still locked
  });

  it("uses new provider after settings change if no messages sent", () => {
    const { result, rerender } = renderConversationLock("gemini");

    expect(result.current.chat.name).toBe("gemini");

    rerender({ provider: "openai" });
    expect(result.current.chat.name).toBe("responses"); // OpenAI uses Responses API
  });

  it("clears lock on clearConversation", async () => {
    const { result, rerender, geminiChat } = renderConversationLock("gemini");

    await act(async () => {
      await result.current.wrappedHandleSend("Hello");
    });

    rerender({ provider: "openai" });
    expect(result.current.chat.name).toBe("gemini"); // Still locked

    await act(async () => {
      result.current.wrappedClearConversation();
    });
    expect(geminiChat.clearConversation).toHaveBeenCalled();
    expect(result.current.chat.name).toBe("responses"); // Now unlocked, OpenAI uses Responses
  });

  it("passes message options to handleSend", async () => {
    const { result, geminiChat } = renderConversationLock("gemini");
    const options = { thinking: "High", temperature: 0.5 };

    await act(async () => {
      await result.current.wrappedHandleSend("Hello", options);
    });
    expect(geminiChat.handleSend).toHaveBeenCalledWith("Hello", options);
  });

  it("routes to responses chat when settingsProvider is openai", () => {
    const { result } = renderConversationLock("openai");

    expect(result.current.chat.name).toBe("responses");
  });

  it("routes non-gemini providers to openai chat", () => {
    const { result } = renderConversationLock("openrouter");

    expect(result.current.chat.name).toBe("openai");
  });

  it("does not re-lock provider on subsequent messages", async () => {
    const { result, rerender, geminiChat } = renderConversationLock("gemini");

    // First message locks provider
    await act(async () => {
      await result.current.wrappedHandleSend("First message");
    });

    // Change settings provider
    rerender({ provider: "openai" });

    // Second message should use locked provider (gemini), not re-lock to openai
    await act(async () => {
      await result.current.wrappedHandleSend("Second message");
    });

    expect(geminiChat.handleSend).toHaveBeenCalledTimes(2);
    expect(result.current.chat.name).toBe("gemini");
  });
});
