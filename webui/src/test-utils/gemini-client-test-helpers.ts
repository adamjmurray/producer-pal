import type { Chat } from "@google/genai/web";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { vi } from "vitest";
import type { GeminiClient } from "#webui/chat/gemini/client";

/** Options for creating a mock MCP client */
export interface MockGeminiMcpClientOptions {
  tools?: Array<{ name: string; description: string; inputSchema: unknown }>;
  callToolResults?: unknown[];
}

/**
 * Creates a mock MCP client for Gemini client tests.
 * @param options - Configuration for the mock client
 * @returns Mock MCP client object
 */
export function createMockGeminiMcpClient(
  options: MockGeminiMcpClientOptions = {},
): { connect: unknown; listTools: unknown; callTool: unknown } {
  const { tools = [], callToolResults = [] } = options;
  const callToolMock = vi.fn();

  for (const result of callToolResults) {
    callToolMock.mockResolvedValueOnce(result);
  }

  if (callToolResults.length === 0) {
    callToolMock.mockResolvedValue({ content: [{ text: "Tool result" }] });
  }

  return {
    connect: vi.fn(),
    listTools: vi.fn().mockResolvedValue({ tools }),
    callTool: callToolMock,
  };
}

/**
 * Sets up mock clients on a GeminiClient instance.
 * @param client - GeminiClient instance to configure
 * @param mockMcpClient - Mock MCP client
 * @param mockChat - Mock chat instance
 */
export function setupGeminiMocks(
  client: GeminiClient,
  mockMcpClient: unknown,
  mockChat: unknown,
): void {
  client.ai = {
    chats: { create: vi.fn().mockReturnValue(mockChat) },
  } as unknown as typeof client.ai;
  client.mcpClient = mockMcpClient as Client;
  client.chat = mockChat as Chat;
  client.chatConfig = {};
}

/** History entry with role property */
export interface HistoryEntry {
  role: string;
  [key: string]: unknown;
}

/**
 * Collects all history updates from a Gemini sendMessage generator.
 * @param client - GeminiClient instance
 * @param message - Message to send
 * @returns Array of history snapshots
 */
export async function collectGeminiHistory(
  client: GeminiClient,
  message: string = "test",
): Promise<HistoryEntry[][]> {
  const historyUpdates: HistoryEntry[][] = [];

  for await (const history of client.sendMessage(message)) {
    historyUpdates.push([...(history as HistoryEntry[])]);
  }

  return historyUpdates;
}

/** Result from setupGeminiOverrideMocks containing the tracked create calls */
export interface OverrideMocksResult {
  createCalls: unknown[];
  mockChat: { sendMessageStream: ReturnType<typeof vi.fn> };
}

/**
 * Sets up mocks for testing message overrides (temperature, thinking, etc.).
 * @param client - GeminiClient instance to configure
 * @returns Object containing createCalls array and mockChat
 */
export function setupGeminiOverrideMocks(
  client: GeminiClient,
): OverrideMocksResult {
  const mockMcpClient = {
    connect: vi.fn(),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn(),
  };

  const createCalls: unknown[] = [];
  const mockChat = {
    sendMessageStream: vi.fn().mockImplementation(async function* () {
      yield {
        candidates: [
          { content: { role: "model", parts: [{ text: "Response" }] } },
        ],
      };
    }),
  };

  client.ai = {
    chats: {
      create: vi.fn((config) => {
        createCalls.push(config);

        return mockChat;
      }),
    },
  } as unknown as typeof client.ai;

  client.mcpClient = mockMcpClient as unknown as Client;
  client.chat = mockChat as unknown as Chat;

  return { createCalls, mockChat };
}
