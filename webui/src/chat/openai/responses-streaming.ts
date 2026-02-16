// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Streaming event handlers for OpenAI Responses API
 * Processes typed events from responses.create({ stream: true })
 */
import {
  type ResponsesConversationItem,
  type ResponsesOutputItem,
  type ResponsesStreamEvent,
  type ResponsesStreamState,
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
    streamingReasoningIndex: null,
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

/** Streaming reasoning item type (formatter renders as thought) */
interface StreamingReasoningItem {
  type: "reasoning";
  text: string;
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
 * Get or create a streaming reasoning item in the conversation.
 * Uses reasoning type so the formatter renders it as a thought/disclosure.
 * @param state - Stream state
 * @param conversation - Conversation array
 * @returns The streaming reasoning item
 */
function getOrCreateStreamingReasoning(
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): StreamingReasoningItem {
  if (state.streamingReasoningIndex != null) {
    return conversation[
      state.streamingReasoningIndex
    ] as unknown as StreamingReasoningItem;
  }

  const item: StreamingReasoningItem = { type: "reasoning", text: "" };

  state.streamingReasoningIndex = conversation.length;
  conversation.push(item as unknown as ResponsesConversationItem);

  return item;
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

    const item = getOrCreateStreamingReasoning(state, conversation);

    item.text = state.currentReasoning;
  }
}

/**
 * Handle reasoning done event - finalizes reasoning with the complete text.
 * Some providers (LM Studio) send the full reasoning in this event.
 * @param event - Stream event with full text
 * @param state - Stream state to update
 * @param conversation - Conversation array to update
 */
function handleReasoningDone(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): void {
  // The done event includes the complete text; use it as authoritative source
  const text = (event as { text?: string }).text;

  if (text) {
    state.currentReasoning = text;

    const item = getOrCreateStreamingReasoning(state, conversation);

    item.text = text;
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
 * Remove streaming placeholders from conversation (higher index first to preserve indices).
 * @param state - Stream state with placeholder indices
 * @param conversation - Conversation array to modify
 */
function removeStreamingPlaceholders(
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): void {
  // Remove in reverse index order so earlier indices stay valid
  const indices = [state.streamingItemIndex, state.streamingReasoningIndex]
    .filter((i): i is number => i != null)
    .sort((a, b) => b - a);

  for (const index of indices) {
    conversation.splice(index, 1);
  }

  state.streamingItemIndex = null;
  state.streamingReasoningIndex = null;
}

/**
 * Handle response completion - replace streaming placeholders with final outputs.
 * If reasoning was accumulated during streaming but the final output doesn't include
 * a reasoning item (e.g., LM Studio), injects a synthetic reasoning item.
 * @param event - Stream event
 * @param state - Stream state to update
 * @param conversation - Conversation array to append to
 */
function handleResponseCompleted(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
  conversation: ResponsesConversationItem[],
): void {
  removeStreamingPlaceholders(state, conversation);

  const output = event.response?.output;

  if (output) {
    state.outputItems = output;

    // If we accumulated reasoning but final output has no reasoning item, inject one
    const hasReasoningOutput = output.some((item) => item.type === "reasoning");

    if (state.currentReasoning && !hasReasoningOutput) {
      const syntheticReasoning = {
        type: "reasoning",
        text: state.currentReasoning,
      };

      conversation.push(
        syntheticReasoning as unknown as ResponsesConversationItem,
      );
    }

    conversation.push(...(output as unknown as ResponsesConversationItem[]));
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

  const text = (item as { text?: string }).text;

  if (text) return text;

  // LM Studio: content array with reasoning_text entries
  const content: unknown = (item as { content?: unknown }).content;

  if (Array.isArray(content) && content.length > 0) {
    return (content as Array<{ text?: string }>)
      .map((c) => c.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  return "";
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
    case "response.reasoning_text.delta": // LM Studio variant
      handleReasoningDelta(event, state, conversation);
      break;
    case "response.reasoning.done":
    case "response.reasoning_text.done": // LM Studio variant
      handleReasoningDone(event, state, conversation);
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
