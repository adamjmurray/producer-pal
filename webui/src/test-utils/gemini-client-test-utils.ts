import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { vi } from "vitest";
import type { Chat, GeminiClient } from "#webui/chat/gemini-client";

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

/**
 * Collects all history updates from a Gemini sendMessage generator.
 * @param client - GeminiClient instance
 * @param message - Message to send
 * @returns Array of history snapshots
 */
export async function collectGeminiHistory(
  client: GeminiClient,
  message: string = "test",
): Promise<unknown[][]> {
  const historyUpdates: unknown[][] = [];

  for await (const history of client.sendMessage(message)) {
    historyUpdates.push([...(history as unknown[])]);
  }

  return historyUpdates;
}
