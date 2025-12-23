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

interface StreamState {
  inThought: boolean;
  outputItems: ResponseOutput[];
}

interface StreamEvent {
  type: string;
  delta?: { text?: string };
  name?: string;
  arguments?: string;
  call_id?: string;
  response?: { output?: ResponseOutput[] };
}

type McpClient = SessionContext["mcpClient"];

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
  _turnCount: number,
): Promise<void> {
  const { conversation, model, options } = ctx;

  // Add user message to conversation
  conversation.push({
    type: "message",
    role: "user",
    content: input,
  });

  const requestBody = buildRequestBody(ctx, model, options);

  if (options.debug || options.verbose) {
    debugCall("responses.create", {
      ...requestBody,
      tools: "[...]",
      input: `[${conversation.length} items]`,
    });
  }

  console.log(`\n[Turn ${conversation.length}] Assistant:`);

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
  const { client, conversation, options } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (await (client as any).responses.create(
    requestBody,
  )) as OpenAIResponse;

  if (options.debug || options.verbose) {
    debugLog(response);
  }

  // Process output items
  for (const item of response.output) {
    await processOutputItem(item, ctx);
  }

  // Add assistant response to conversation for multi-turn
  conversation.push(...(response.output as ConversationItem[]));
}

async function handleStreamingResponse(
  ctx: SessionContext,
  requestBody: Record<string, unknown>,
): Promise<void> {
  const { client, options } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (client as any).responses.create({
    ...requestBody,
    stream: true,
  });

  const state: StreamState = { inThought: false, outputItems: [] };

  for await (const event of stream) {
    if (options.debug || options.verbose) {
      console.log(DEBUG_SEPARATOR);
      console.log("Stream event:", event.type);
      debugLog(event);
    }

    await processStreamEvent(event as StreamEvent, state, ctx);
  }

  console.log();
}

function handleReasoningDelta(event: StreamEvent, state: StreamState): void {
  if (event.delta?.text) {
    if (!state.inThought) {
      process.stdout.write(startThought(event.delta.text));
      state.inThought = true;
    } else {
      process.stdout.write(continueThought(event.delta.text));
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

  process.stdout.write(event.delta?.text ?? "");
}

async function handleFunctionCallDone(
  event: StreamEvent,
  state: StreamState,
  mcpClient: McpClient,
): Promise<void> {
  if (!event.name || !event.arguments) return;

  const args = JSON.parse(event.arguments) as Record<string, unknown>;

  console.log("\n" + formatToolCall(event.name, args));

  const result = await mcpClient.callTool({
    name: event.name,
    arguments: args,
  });

  console.log(formatToolResult(extractToolResultText(result)));

  state.outputItems.push({
    type: "function_call",
    id: event.call_id,
    call_id: event.call_id,
    name: event.name,
    arguments: event.arguments,
  });
  state.outputItems.push({
    type: "function_call_output",
    call_id: event.call_id,
  } as ResponseOutput);
}

function handleResponseCompleted(
  event: StreamEvent,
  conversation: ConversationItem[],
): void {
  if (event.response?.output) {
    conversation.push(...(event.response.output as ConversationItem[]));
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
    case "response.function_call_arguments.done":
      await handleFunctionCallDone(event, state, ctx.mcpClient);
      break;
    case "response.completed":
      handleResponseCompleted(event, ctx.conversation);
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
        const reasoningText = item.summary ?? item.text ?? "";

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
