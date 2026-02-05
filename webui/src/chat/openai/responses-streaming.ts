// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Streaming event handlers for OpenAI Responses API
 * Processes typed events from responses.create({ stream: true })
 */
import type {
  ResponsesConversationItem,
  ResponsesOutputItem,
  ResponsesStreamEvent,
  ResponsesStreamState,
} from "#webui/types/responses-api";

type McpClient = {
  callTool: (params: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<{ content: unknown }>;
};

/**
 * Create initial stream state
 * @returns Fresh stream state object
 */
export function createStreamState(): ResponsesStreamState {
  return {
    currentContent: "",
    currentReasoning: "",
    pendingFunctionCalls: new Map(),
    toolResults: new Map(),
    hasToolCalls: false,
    outputItems: [],
    streamingItemIndex: null,
  };
}

/**
 * Get text from delta (can be string or object with text property)
 * @param delta - Delta from stream event
 * @returns Text content or undefined
 */
function getDeltaText(
  delta: ResponsesStreamEvent["delta"],
): string | undefined {
  return typeof delta === "string" ? delta : delta?.text;
}

/** Streaming message item type */
interface StreamingMessageItem {
  type: "message";
  role: "assistant";
  content: string;
}

/**
 * Get or create a streaming placeholder message in the conversation.
 * This allows the UI to show incremental text updates during streaming.
 * @param state - Stream state
 * @param conversation - Conversation array
 * @returns The streaming message item
 */
function getOrCreateStreamingMessage(
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): StreamingMessageItem {
  if (state.streamingItemIndex != null) {
    return conversation[state.streamingItemIndex] as StreamingMessageItem;
  }

  const streamingItem: StreamingMessageItem = {
    type: "message",
    role: "assistant",
    content: "",
  };

  state.streamingItemIndex = conversation.length;
  conversation.push(streamingItem);

  return streamingItem;
}

/**
 * Handle reasoning delta event - updates state and conversation for streaming display
 * @param event - Stream event
 * @param state - Stream state to update
 * @param conversation - Conversation array to update
 */
function handleReasoningDelta(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): void {
  const text = getDeltaText(event.delta);

  if (text) {
    state.currentReasoning += text;

    // Update streaming message for incremental UI updates
    const msg = getOrCreateStreamingMessage(state, conversation);

    msg.content = state.currentReasoning;
  }
}

/**
 * Handle output text delta event - updates state and conversation for streaming display
 * @param event - Stream event
 * @param state - Stream state to update
 * @param conversation - Conversation array to update
 */
function handleTextDelta(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): void {
  const text = getDeltaText(event.delta);

  if (text) {
    state.currentContent += text;

    // Update streaming message for incremental UI updates
    const msg = getOrCreateStreamingMessage(state, conversation);

    msg.content = state.currentContent;
  }
}

/**
 * Handle new output item being added
 * @param event - Stream event
 * @param state - Stream state to update
 */
function handleOutputItemAdded(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
): void {
  const item = event.item;

  if (item?.type === "function_call" && item.name && item.call_id) {
    state.pendingFunctionCalls.set(item.id, {
      name: item.name,
      call_id: item.call_id,
    });
    state.hasToolCalls = true;
  }
}

/**
 * Handle function call arguments completion - execute tool
 * @param event - Stream event
 * @param state - Stream state to update
 * @param mcpClient - MCP client for tool execution
 */
async function handleFunctionCallDone(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  mcpClient: McpClient,
): Promise<void> {
  if (!event.item_id || !event.arguments) return;

  const functionInfo = state.pendingFunctionCalls.get(event.item_id);

  if (!functionInfo) return;

  const args = JSON.parse(event.arguments) as Record<string, unknown>;
  const result = await mcpClient.callTool({
    name: functionInfo.name,
    arguments: args,
  });
  const resultText = JSON.stringify(result.content);

  state.toolResults.set(functionInfo.call_id, resultText);
}

/**
 * Handle response completion - replace streaming placeholder with final outputs
 * @param event - Stream event
 * @param state - Stream state to update
 * @param conversation - Conversation array to append to
 */
function handleResponseCompleted(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): void {
  // Remove streaming placeholder if present (will be replaced by final output)
  if (state.streamingItemIndex != null) {
    conversation.splice(state.streamingItemIndex, 1);
    state.streamingItemIndex = null;
  }

  if (event.response?.output) {
    state.outputItems = event.response.output;
    conversation.push(
      ...(event.response.output as unknown as ResponsesConversationItem[]),
    );
  }

  // Add tool results to conversation
  for (const [call_id, resultText] of state.toolResults) {
    conversation.push({
      type: "function_call_output",
      call_id,
      output: resultText,
    });
  }
}

/**
 * Extract text from reasoning output item
 * @param item - Reasoning output item
 * @returns Extracted reasoning text
 */
export function extractReasoningText(item: ResponsesOutputItem): string {
  if (item.type !== "reasoning") return "";

  const summary: unknown = (item as { summary?: unknown }).summary;

  if (typeof summary === "string") return summary;

  if (Array.isArray(summary) && summary.length > 0) {
    return (summary as Array<{ text?: string }>)
      .map((s) => s.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  return (item as { text?: string }).text ?? "";
}

/**
 * Process a streaming event from the OpenAI Responses API
 * Updates state and conversation based on event type
 * @param event - Stream event to process
 * @param state - Stream state to update
 * @param mcpClient - MCP client for tool execution
 * @param conversation - Conversation array to update
 */
export async function processStreamEvent(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  mcpClient: McpClient,
  conversation: ResponsesConversationItem[],
): Promise<void> {
  switch (event.type) {
    case "response.reasoning.delta":
      handleReasoningDelta(event, state, conversation);
      break;
    case "response.output_text.delta":
      handleTextDelta(event, state, conversation);
      break;
    case "response.output_item.added":
      handleOutputItemAdded(event, state);
      break;
    case "response.function_call_arguments.done":
      await handleFunctionCallDone(event, state, mcpClient);
      break;
    case "response.completed":
      handleResponseCompleted(event, state, conversation);
      break;
  }
}
