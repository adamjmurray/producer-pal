/**
 * Shared streaming helpers for Chat API implementations (OpenAI, OpenRouter)
 */

import {
  formatToolCall,
  formatToolResult,
  startThought,
  continueThought,
  endThought,
} from "./formatting.ts";
import { extractToolResultText } from "./mcp.ts";
import type {
  OpenRouterStreamChunk,
  OpenRouterToolCall,
  ReasoningDetail,
} from "./types.ts";

export interface StreamState {
  inThought: boolean;
  currentContent: string;
  currentReasoning: string;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  reasoningDetails: ReasoningDetail[];
}

/**
 * Create initial streaming state
 *
 * @returns Empty stream state
 */
export function createStreamState(): StreamState {
  return {
    inThought: false,
    currentContent: "",
    currentReasoning: "",
    toolCalls: new Map<
      number,
      { id: string; name: string; arguments: string }
    >(),
    reasoningDetails: [],
  };
}

/**
 * Write thought/reasoning text to stdout with formatting
 *
 * @param text - The thought text to write
 * @param state - Stream state to update
 */
export function writeThoughtText(text: string, state: StreamState): void {
  state.currentReasoning += text;

  if (!state.inThought) {
    process.stdout.write(startThought(text));
    state.inThought = true;
  } else {
    process.stdout.write(continueThought(text));
  }
}

function processReasoningDetails(
  details: ReasoningDetail[],
  state: StreamState,
): void {
  for (const detail of details) {
    if (detail.type === "reasoning.text" && detail.text) {
      writeThoughtText(detail.text, state);
    }

    state.reasoningDetails.push(detail);
  }
}

function processContent(content: string, state: StreamState): void {
  if (state.inThought) {
    process.stdout.write(endThought());
    state.inThought = false;
  }

  process.stdout.write(content);
  state.currentContent += content;
}

interface StreamToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

function processToolCallDeltas(
  toolCalls: StreamToolCallDelta[],
  state: StreamState,
): void {
  for (const tc of toolCalls) {
    const existing = state.toolCalls.get(tc.index);

    if (existing) {
      if (tc.function?.arguments) {
        existing.arguments += tc.function.arguments;
      }
    } else {
      state.toolCalls.set(tc.index, {
        id: tc.id ?? "",
        name: tc.function?.name ?? "",
        arguments: tc.function?.arguments ?? "",
      });
    }
  }
}

/**
 * Process a streaming chunk and update state
 *
 * @param chunk - The stream chunk to process
 * @param state - Stream state to update
 */
export function processStreamChunk(
  chunk: OpenRouterStreamChunk,
  state: StreamState,
): void {
  const delta = chunk.choices[0]?.delta;

  if (!delta) return;

  if (delta.reasoning) writeThoughtText(delta.reasoning, state);
  if (delta.reasoning_details)
    processReasoningDetails(delta.reasoning_details, state);
  if (delta.content) processContent(delta.content, state);
  if (delta.tool_calls) processToolCallDeltas(delta.tool_calls, state);
}

/**
 * Build tool calls array from streaming state
 *
 * @param state - Stream state containing tool calls
 * @returns Array of tool calls
 */
export function buildToolCallsArray(state: StreamState): OpenRouterToolCall[] {
  return Array.from(state.toolCalls.values()).map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.name, arguments: tc.arguments },
  }));
}

interface McpClient {
  callTool: (params: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<unknown>;
}

interface ChatMessage {
  role: "tool";
  content: string;
  tool_call_id: string;
}

/**
 * Execute a tool call and add result to messages
 *
 * @param mcpClient - MCP client to execute the call
 * @param messages - Message array to add result to
 * @param toolCall - Tool call to execute
 */
export async function executeToolCall(
  mcpClient: McpClient,
  messages: ChatMessage[],
  toolCall: OpenRouterToolCall,
): Promise<void> {
  const { name, arguments: argsJson } = toolCall.function;

  let args: Record<string, unknown>;

  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    args = {};
  }

  console.log(formatToolCall(name, args));

  try {
    const result = await mcpClient.callTool({ name, arguments: args });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultText = extractToolResultText(result as any);

    console.log(formatToolResult(resultText));
    messages.push({
      role: "tool",
      content: resultText,
      tool_call_id: toolCall.id,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.log(formatToolResult(`Error: ${errorMsg}`));
    messages.push({
      role: "tool",
      content: `Error: ${errorMsg}`,
      tool_call_id: toolCall.id,
    });
  }
}
