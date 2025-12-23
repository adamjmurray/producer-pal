import OpenAI from "openai";
import {
  formatThought,
  formatToolCall,
  formatToolResult,
  startThought,
  continueThought,
  endThought,
  debugLog,
  debugCall,
  DEBUG_SEPARATOR,
} from "./shared/formatting.ts";
import {
  connectMcp,
  extractToolResultText,
  getMcpToolsForOpenAI,
} from "./shared/mcp.ts";
import { createReadline, runChatLoop } from "./shared/readline.ts";
import type { ChatOptions } from "./shared/types.ts";

const DEFAULT_MODEL = "gpt-5.2-2025-12-11";

interface ConversationItem {
  type: string;
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
  id?: string;
  status?: string;
}

interface ResponseOutput {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type: string; text?: string }>;
  status?: string;
  summary?: string;
  text?: string;
}

interface OpenAIResponse {
  id: string;
  output: ResponseOutput[];
  output_text?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

interface SessionContext {
  client: OpenAI;
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: Awaited<ReturnType<typeof getMcpToolsForOpenAI>>;
  conversation: ConversationItem[];
  model: string;
  options: ChatOptions;
}

interface PendingFunctionCall {
  name: string;
  call_id: string;
}

interface StreamState {
  inThought: boolean;
  pendingFunctionCalls: Map<string, PendingFunctionCall>;
  toolResults: Map<string, string>; // call_id -> result text
  hasToolCalls: boolean;
}

interface StreamEventItem {
  id: string;
  type: string;
  name?: string;
  call_id?: string;
  arguments?: string;
}

interface StreamEvent {
  type: string;
  delta?: { text?: string } | string;
  item_id?: string;
  arguments?: string;
  item?: StreamEventItem;
  response?: { output?: ResponseOutput[] };
}

/**
 * Run an interactive chat session with OpenAI Responses API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenAI(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.OPENAI_KEY;

  if (!apiKey) {
    console.error("Error: OPENAI_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForOpenAI(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenAI (Responses API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  // Conversation history for multi-turn
  const conversation: ConversationItem[] = [];

  try {
    await runChatLoop(
      { client, mcpClient, tools, conversation, model, options },
      rl,
      initialText,
      { sendMessage },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function sendMessage(
  ctx: SessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
  const { conversation, model, options } = ctx;

  // Add user message to conversation
  conversation.push({
    type: "message",
    role: "user",
    content: input,
  });

  const requestBody = buildRequestBody(ctx, model, options);

  if (options.debug) {
    debugCall("responses.create", {
      ...requestBody,
      tools: "[...]",
      input: `[${conversation.length} items]`,
    });
  }

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  if (options.stream) {
    await handleStreamingResponse(ctx, requestBody);
  } else {
    await handleNonStreamingResponse(ctx, requestBody);
  }
}

function buildRequestBody(
  ctx: SessionContext,
  model: string,
  options: ChatOptions,
): Record<string, unknown> {
  const { conversation, tools } = ctx;

  const requestBody: Record<string, unknown> = {
    model,
    input: conversation,
    tools,
  };

  // Configure reasoning/thinking
  if (options.thinking) {
    requestBody.reasoning = { effort: options.thinking };
  }

  if (options.outputTokens != null) {
    requestBody.max_output_tokens = options.outputTokens;
  }

  if (options.randomness != null) {
    requestBody.temperature = options.randomness;
  }

  if (options.systemPrompt != null) {
    requestBody.instructions = options.systemPrompt;
  }

  return requestBody;
}

async function handleNonStreamingResponse(
  ctx: SessionContext,
  requestBody: Record<string, unknown>,
): Promise<void> {
  const { client, conversation, model, options } = ctx;

  // Agentic loop: keep calling API until no more tool calls
  let continueLoop = true;

  while (continueLoop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await (client as any).responses.create(
      requestBody,
    )) as OpenAIResponse;

    if (options.debug) {
      debugLog(response);
    }

    // Check if there are any tool calls in the response
    const hasToolCalls = response.output.some(
      (item) => item.type === "function_call",
    );

    // Process output items and collect tool results
    for (const item of response.output) {
      await processOutputItem(item, ctx);
    }

    // Add assistant response to conversation for multi-turn
    conversation.push(...(response.output as ConversationItem[]));

    if (hasToolCalls) {
      // Update request body with new conversation for next iteration
      requestBody = buildRequestBody(ctx, model, options);

      if (options.debug) {
        debugCall("responses.create (tool continuation)", {
          ...requestBody,
          tools: "[...]",
          input: `[${conversation.length} items]`,
        });
      }
    } else {
      // No tool calls, exit loop
      continueLoop = false;
    }
  }
}

async function handleStreamingResponse(
  ctx: SessionContext,
  requestBody: Record<string, unknown>,
): Promise<void> {
  const { client, conversation, model, options } = ctx;

  // Agentic loop: keep calling API until no more tool calls
  let continueLoop = true;

  while (continueLoop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (client as any).responses.create({
      ...requestBody,
      stream: true,
    });

    const state: StreamState = {
      inThought: false,
      pendingFunctionCalls: new Map(),
      toolResults: new Map(),
      hasToolCalls: false,
    };

    for await (const event of stream) {
      if (options.debug) {
        console.log(DEBUG_SEPARATOR);
        console.log("Stream event:", event.type);
        debugLog(event);
      }

      await processStreamEvent(event as StreamEvent, state, ctx);
    }

    console.log();

    if (state.hasToolCalls) {
      // Update request body with new conversation for next iteration
      requestBody = buildRequestBody(ctx, model, options);

      if (options.debug) {
        debugCall("responses.create (tool continuation)", {
          ...requestBody,
          tools: "[...]",
          input: `[${conversation.length} items]`,
        });
      }
    } else {
      continueLoop = false;
    }
  }
}

function getDeltaText(delta: StreamEvent["delta"]): string | undefined {
  return typeof delta === "string" ? delta : delta?.text;
}

function handleReasoningDelta(event: StreamEvent, state: StreamState): void {
  const text = getDeltaText(event.delta);

  if (text) {
    if (!state.inThought) {
      process.stdout.write(startThought(text));
      state.inThought = true;
    } else {
      process.stdout.write(continueThought(text));
    }
  }
}

function handleReasoningDone(state: StreamState): void {
  if (state.inThought) {
    process.stdout.write(endThought());
    state.inThought = false;
  }
}

function handleTextDelta(event: StreamEvent, state: StreamState): void {
  if (state.inThought) {
    process.stdout.write(endThought());
    state.inThought = false;
  }

  process.stdout.write(getDeltaText(event.delta) ?? "");
}

function handleOutputItemAdded(event: StreamEvent, state: StreamState): void {
  const item = event.item;

  if (item?.type === "function_call" && item.name && item.call_id) {
    state.pendingFunctionCalls.set(item.id, {
      name: item.name,
      call_id: item.call_id,
    });
    // Mark that we have tool calls early, before any async operations
    state.hasToolCalls = true;
  }
}

async function handleFunctionCallDone(
  event: StreamEvent,
  state: StreamState,
  ctx: SessionContext,
): Promise<void> {
  const { mcpClient } = ctx;
  const itemId = event.item_id;

  if (!itemId || !event.arguments) return;

  const functionInfo = state.pendingFunctionCalls.get(itemId);

  if (!functionInfo) return;

  const { name, call_id } = functionInfo;
  const args = JSON.parse(event.arguments) as Record<string, unknown>;

  console.log("\n" + formatToolCall(name, args));

  const result = await mcpClient.callTool({ name, arguments: args });
  const resultText = extractToolResultText(result);

  console.log(formatToolResult(resultText));

  // Store result for later - we'll add to conversation in response.completed
  // This ensures we include all output items (including reasoning) from the response
  state.toolResults.set(call_id, resultText);
}

function handleResponseCompleted(
  event: StreamEvent,
  state: StreamState,
  conversation: ConversationItem[],
): void {
  // Add all output items from response (includes reasoning + function_call items)
  if (event.response?.output) {
    conversation.push(...(event.response.output as ConversationItem[]));
  }

  // Add function_call_output for each tool result
  for (const [call_id, resultText] of state.toolResults) {
    conversation.push({
      type: "function_call_output",
      call_id,
      output: resultText,
    });
  }
}

async function processStreamEvent(
  event: StreamEvent,
  state: StreamState,
  ctx: SessionContext,
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
      await handleFunctionCallDone(event, state, ctx);
      break;
    case "response.completed":
      // Always add all output items (reasoning + function_call) and tool results
      handleResponseCompleted(event, state, ctx.conversation);
      break;
  }
}

async function processOutputItem(
  item: ResponseOutput,
  ctx: SessionContext,
): Promise<void> {
  const { mcpClient, conversation } = ctx;

  switch (item.type) {
    case "reasoning":
      // Non-streaming reasoning - shown as thought block
      {
        // summary can be string, array, or null - extract meaningful text
        const summary: unknown = item.summary;
        const summaryText =
          typeof summary === "string"
            ? summary
            : Array.isArray(summary) && summary.length > 0
              ? (summary as string[]).join("\n")
              : "";
        const reasoningText = summaryText || (item.text ?? "");

        if (reasoningText) {
          console.log(formatThought(reasoningText));
        }
      }

      break;

    case "message":
      // Regular message content
      {
        const text = item.content
          ?.filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join("");

        if (text) {
          console.log(text);
        }
      }

      break;

    case "function_call":
      // Tool call
      if (item.name && item.arguments) {
        const args = JSON.parse(item.arguments) as Record<string, unknown>;

        console.log(formatToolCall(item.name, args));

        // Execute the tool
        const result = await mcpClient.callTool({
          name: item.name,
          arguments: args,
        });
        const resultText = extractToolResultText(result);

        console.log(formatToolResult(resultText));

        // Add tool result to conversation
        conversation.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: resultText,
        });
      }

      break;
  }
}
