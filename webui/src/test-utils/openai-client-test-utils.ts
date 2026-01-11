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

/**
 * Creates a tool call chunk for streaming responses.
 * @param toolName - Name of the tool being called
 * @param args - JSON string of tool arguments
 * @param callId - Unique call identifier
 * @returns StreamChunk with tool call
 */
export function createToolCallChunk(
  toolName: string,
  args: string,
  callId: string = "call_1",
): StreamChunk {
  return {
    delta: {
      tool_calls: [
        { index: 0, id: callId, function: { name: toolName, arguments: args } },
      ],
    },
    finish_reason: "tool_calls",
  };
}

/** Done response chunk for ending streaming */
export const DONE_CHUNK: StreamChunk = {
  delta: { content: "Done" },
  finish_reason: "stop",
};

/**
 * Creates a mock AI client structure for OpenAIClient.
 * @param generatorFn - Generator function for streaming responses
 * @returns Mock AI client object
 */
export function createMockAiClient(
  generatorFn: (
    options?: unknown,
  ) => AsyncGenerator<{ choices: [StreamChunk] }, void, unknown>,
): unknown {
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(generatorFn),
      },
    },
  };
}

/**
 * Creates generator that yields tool call then done response.
 * @param toolChunk - Tool call chunk to yield first
 * @returns Generator function for mock AI client
 */
export function createToolThenDoneGenerator(
  toolChunk: StreamChunk,
): () => AsyncGenerator<{ choices: [StreamChunk] }> {
  let callCount = 0;

  return async function* () {
    callCount++;

    yield callCount === 1
      ? { choices: [toolChunk] }
      : { choices: [DONE_CHUNK] };
  };
}

/** OpenAI tool call type for buildStreamMessage tests */
export interface TestToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Creates a tool calls map for buildStreamMessage tests.
 * @param name - Tool function name
 * @param args - JSON string of arguments
 * @param id - Tool call ID
 * @returns Map with single tool call entry
 */
export function createToolCallsMap(
  name: string,
  args: string,
  id: string = "call_123",
): Map<number, TestToolCall> {
  return new Map([
    [0, { id, type: "function", function: { name, arguments: args } }],
  ]);
}
