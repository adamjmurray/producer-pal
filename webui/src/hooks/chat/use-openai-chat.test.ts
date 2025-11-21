/**
 * @vitest-environment happy-dom
 * @returns {any} - Hook return value
 */
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { useOpenAIChat } from "./use-openai-chat";

// Mock OpenAI
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(),
      },
    };
  },
}));

// Mock config
vi.mock("../config.js", () => ({
  SYSTEM_INSTRUCTION: "Test instruction",
}));

// Mock MCP SDK
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = vi.fn();
    close = vi.fn();
    listTools = vi.fn(() => ({ tools: [] }));
    callTool = vi.fn();
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

describe("useOpenAIChat", () => {
  const defaultProps = {
    apiKey: "test-key",
    model: "gpt-4",
    thinking: "Low",
    temperature: 1.0,
    baseUrl: "https://api.openai.com/v1",
    enabledTools: {},
    mcpStatus: "connected" as const,
    mcpError: null,
    checkMcpConnection: vi.fn(),
  };

  it("initializes with empty messages", () => {
    const { result } = renderHook(() => useOpenAIChat(defaultProps));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isAssistantResponding).toBe(false);
    expect(result.current.activeModel).toBeNull();
    expect(result.current.activeThinking).toBeNull();
    expect(result.current.activeTemperature).toBeNull();
  });

  it("clears conversation when clearConversation is called", async () => {
    const { result } = renderHook(() => useOpenAIChat(defaultProps));

    await act(() => {
      result.current.clearConversation();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.activeModel).toBeNull();
    expect(result.current.activeThinking).toBeNull();
    expect(result.current.activeTemperature).toBeNull();
  });

  it("stopResponse sets isAssistantResponding to false", async () => {
    const { result } = renderHook(() => useOpenAIChat(defaultProps));

    await act(() => {
      result.current.stopResponse();
    });

    expect(result.current.isAssistantResponding).toBe(false);
  });
});
