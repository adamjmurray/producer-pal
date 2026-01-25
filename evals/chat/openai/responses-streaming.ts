/**
 * Streaming event handlers for OpenAI Responses API
 */
import {
  formatThought,
  formatToolCall,
  formatToolResult,
  startThought,
  continueThought,
  endThought,
} from "../shared/formatting.ts";
import { extractToolResultText } from "../shared/mcp.ts";
import { type McpClient, parseToolArgs } from "../shared/tool-execution.ts";
import type {
  OpenAIConversationItem,
  OpenAIResponseOutput,
  OpenAIStreamEvent,
  OpenAIStreamState,
} from "../shared/types.ts";

/**
 * Extracts text from a stream event delta
 *
 * @param delta - Delta object or string from stream event
 * @returns Text content or undefined
 */
function getDeltaText(delta: OpenAIStreamEvent["delta"]): string | undefined {
  return typeof delta === "string" ? delta : delta?.text;
}

/**
 * Handles reasoning/thought stream deltas
 *
 * @param event - Stream event with reasoning delta
 * @param state - Current stream state to update
 */
function handleReasoningDelta(
  event: OpenAIStreamEvent,
  state: OpenAIStreamState,
): void {
  const text = getDeltaText(event.delta);

  if (!text) return;
  state.displayedReasoning = true;
  process.stdout.write(
    state.inThought ? continueThought(text) : startThought(text),
  );
  state.inThought = true;
}

/**
 * Handles completion of a reasoning section
 *
 * @param state - Current stream state to update
 */
function handleReasoningDone(state: OpenAIStreamState): void {
  if (state.inThought) {
    process.stdout.write(endThought());
    state.inThought = false;
  }
}

/**
 * Handles text content deltas
 *
 * @param event - Stream event with text delta
 * @param state - Current stream state to update
 */
function handleTextDelta(
  event: OpenAIStreamEvent,
  state: OpenAIStreamState,
): void {
  handleReasoningDone(state);
  const text = getDeltaText(event.delta) ?? "";

  state.currentContent += text;
  process.stdout.write(text);
}

/**
 * Handles new output item events (e.g., function calls)
 *
 * @param event - Stream event with item info
 * @param state - Current stream state to update
 */
function handleOutputItemAdded(
  event: OpenAIStreamEvent,
  state: OpenAIStreamState,
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
 * Executes a completed function call via MCP
 *
 * @param event - Stream event with function call details
 * @param state - Current stream state with pending calls
 * @param mcpClient - MCP client to execute the call
 */
async function handleFunctionCallDone(
  event: OpenAIStreamEvent,
  state: OpenAIStreamState,
  mcpClient: McpClient,
): Promise<void> {
  if (!event.item_id || !event.arguments) return;
  const functionInfo = state.pendingFunctionCalls.get(event.item_id);

  if (!functionInfo) return;

  const args = parseToolArgs(event.arguments);

  functionInfo.args = args;
  console.log("\n" + formatToolCall(functionInfo.name, args));
  const result = await mcpClient.callTool({
    name: functionInfo.name,
    arguments: args,
  });
  const resultText = extractToolResultText(result);

  console.log(formatToolResult(resultText));
  state.toolResults.set(functionInfo.call_id, resultText);
}

/**
 * Extract text from reasoning item summary
 *
 * @param item - The response output item containing reasoning
 * @returns Extracted reasoning text
 */
export function extractReasoningText(item: OpenAIResponseOutput): string {
  const summary: unknown = item.summary;

  if (typeof summary === "string") return summary;

  if (Array.isArray(summary) && summary.length > 0) {
    return (summary as Array<{ text?: string }>)
      .map((s) => s.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  return item.text ?? "";
}

/**
 * Displays any reasoning not shown during streaming
 *
 * @param output - Response output items
 * @param displayed - Whether reasoning was already displayed
 */
function displayMissedReasoning(
  output: OpenAIResponseOutput[],
  displayed: boolean,
): void {
  if (displayed) return;

  for (const item of output) {
    if (item.type === "reasoning") {
      const text = extractReasoningText(item);

      if (text) console.log(formatThought(text));
    }
  }
}

/**
 * Handles response completion and updates conversation
 *
 * @param event - Completion event with final response
 * @param state - Stream state with tool results
 * @param conversation - Conversation array to update
 */
function handleResponseCompleted(
  event: OpenAIStreamEvent,
  state: OpenAIStreamState,
  conversation: OpenAIConversationItem[],
): void {
  if (event.response?.output) {
    displayMissedReasoning(event.response.output, state.displayedReasoning);
    conversation.push(...(event.response.output as OpenAIConversationItem[]));
  }

  for (const [call_id, resultText] of state.toolResults) {
    conversation.push({
      type: "function_call_output",
      call_id,
      output: resultText,
    });
  }
}

/**
 * Process a streaming event from the OpenAI Responses API
 *
 * @param event - The stream event to process
 * @param state - Current stream state
 * @param mcpClient - MCP client for tool calls
 * @param conversation - Conversation array to update
 */
export async function processStreamEvent(
  event: OpenAIStreamEvent,
  state: OpenAIStreamState,
  mcpClient: McpClient,
  conversation: OpenAIConversationItem[],
): Promise<void> {
  switch (event.type) {
    case "response.reasoning.delta":
      handleReasoningDelta(event, state);
      break;
    case "response.reasoning.done":
      handleReasoningDone(state);
      break;
    case "response.output_text.delta":
      handleTextDelta(event, state);
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
