import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { vi } from "vitest";
import type { OpenAIClient } from "#webui/chat/openai-client";

/** Tool definition for mock MCP client */
export interface MockTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Options for creating a mock MCP client */
export interface MockMcpClientOptions {
  tools?: MockTool[];
  callToolResult?: { content: unknown };
  callToolError?: Error;
}

/**
 * Creates a mock MCP client for testing OpenAI client functionality.
 * Reduces duplication of mock client setup across test files.
 * @param options - Configuration for the mock client
 * @returns A mock MCP Client instance
 */
export function createMockMcpClient(
  options: MockMcpClientOptions = {},
): Client {
  const { tools = [], callToolResult, callToolError } = options;

  const callTool = callToolError
    ? vi.fn().mockRejectedValue(callToolError)
    : vi.fn().mockResolvedValue(
        callToolResult ?? {
          content: [{ type: "text", text: "Tool result" }],
        },
      );

  return {
    connect: vi.fn(),
    listTools: vi.fn().mockResolvedValue({ tools }),
    callTool,
  } as unknown as Client;
}

/** Delta content in streaming response */
export interface StreamDelta {
  role?: string;
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** Single chunk in streaming response */
export interface StreamChunk {
  delta: StreamDelta;
  finish_reason: string | null;
}

/**
 * Creates a mock OpenAI streaming response generator.
 * Returns an async generator that yields chunks as specified.
 * @param chunks - Array of stream chunks to yield
 * @returns Factory function that creates the async generator
 */
export function createMockStreamingResponse(
  chunks: StreamChunk[],
): () => AsyncGenerator<{ choices: [StreamChunk] }> {
  return async function* () {
    for (const chunk of chunks) {
      yield { choices: [chunk] };
    }
  };
}

/**
 * Creates simple text streaming chunks (content + stop).
 * @param textParts - Text content to stream in chunks
 * @returns Array of stream chunks ending with stop
 */
export function createTextStreamChunks(...textParts: string[]): StreamChunk[] {
  const chunks: StreamChunk[] = textParts.map((content, idx) => ({
    delta: { content, ...(idx === 0 ? { role: "assistant" } : {}) },
    finish_reason: null,
  }));

  chunks.push({ delta: {}, finish_reason: "stop" });

  return chunks;
}

/**
 * Assigns mock MCP and OpenAI clients to an OpenAIClient instance for testing.
 * @param client - OpenAI client instance to configure
 * @param mcpClient - Mock MCP client to assign
 * @param streamingResponse - Mock streaming response generator
 */
export function setupMockClients(
  client: OpenAIClient,
  mcpClient: Client,
  streamingResponse: () => AsyncGenerator<{ choices: [StreamChunk] }>,
): void {
  client.mcpClient = mcpClient;
  client.ai = {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(streamingResponse),
      },
    },
  } as unknown as typeof client.ai;
}

/**
 * Collects all history updates from a sendMessage generator.
 * @param generator - Async generator yielding history arrays
 * @returns Array of all history snapshots
 */
export async function collectHistoryUpdates(
  generator: AsyncGenerator<unknown[]>,
): Promise<unknown[][]> {
  const updates: unknown[][] = [];

  for await (const history of generator) {
    updates.push([...history]);
  }

  return updates;
}
