/**
 * @vitest-environment happy-dom
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useGeminiChat } from "./use-gemini-chat.js";

// Mock GeminiClient
vi.mock("../chat/gemini-client.js", () => ({
  GeminiClient: class MockGeminiClient {
    initialize = vi.fn();
    sendMessage = vi.fn();
  },
}));

// Mock formatter
vi.mock("../chat/gemini-formatter.js", () => ({
  formatGeminiMessages: vi.fn((messages) => messages),
}));

// Mock config
vi.mock("../config.js", () => ({
  getThinkingBudget: vi.fn(() => ({ mode: "auto" })),
  SYSTEM_INSTRUCTION: "Test instruction",
}));

describe("useGeminiChat", () => {
  const defaultProps = {
    apiKey: "test-key",
    model: "gemini-2.5-flash",
    thinking: "Auto",
    temperature: 1.0,
    showThoughts: false,
    enabledTools: {},
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: vi.fn(),
  };

  it("initializes with empty messages", () => {
    const { result } = renderHook(() => useGeminiChat(defaultProps));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isAssistantResponding).toBe(false);
    expect(result.current.activeModel).toBeNull();
    expect(result.current.activeThinking).toBeNull();
    expect(result.current.activeTemperature).toBeNull();
  });

  it("clears conversation when clearConversation is called", async () => {
    const { result } = renderHook(() => useGeminiChat(defaultProps));

    await act(() => {
      result.current.clearConversation();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.activeModel).toBeNull();
    expect(result.current.activeThinking).toBeNull();
    expect(result.current.activeTemperature).toBeNull();
  });

  it("stopResponse sets isAssistantResponding to false", async () => {
    const { result } = renderHook(() => useGeminiChat(defaultProps));

    await act(() => {
      result.current.stopResponse();
    });

    expect(result.current.isAssistantResponding).toBe(false);
  });
});
