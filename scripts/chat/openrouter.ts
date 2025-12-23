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
import { connectMcp, getMcpToolsForChat, type ChatTool } from "./shared/mcp.ts";
import { createReadline, runChatLoop } from "./shared/readline.ts";
import type {
  ChatOptions,
  OpenRouterMessage,
  OpenRouterReasoningConfig,
  OpenRouterResponse,
  OpenRouterStreamChunk,
  OpenRouterToolCall,
  ReasoningDetail,
} from "./shared/types.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

interface SessionContext {
  client: OpenAI;
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: ChatTool[];
  messages: OpenRouterMessage[];
  model: string;
  options: ChatOptions;
}

type McpClient = SessionContext["mcpClient"];

function extractToolResultText(
  result: Awaited<ReturnType<McpClient["callTool"]>>,
): string {
  const content = result.content as Array<{ text?: string }> | undefined;

  return content?.[0]?.text ?? "";
}

/**
 * Run an interactive chat session with OpenRouter Chat API
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenRouter(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;

  // Use OpenAI SDK with OpenRouter base URL
  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://producer-pal.org",
      "X-Title": "Producer Pal CLI",
    },
  });

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForChat(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenRouter`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messages: OpenRouterMessage[] = [];

  try {
    await runChatLoop(
      { client, mcpClient, tools, messages, model, options },
      rl,
      initialText,
      { sendMessage },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);

    if (options.debug || options.verbose) {
      console.error(error);
    }

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
  const { messages, options } = ctx;

  messages.push({
    role: "user",
    content: input,
  });

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const shouldContinue = options.stream
      ? await handleStreamingResponse(ctx)
      : await handleNonStreamingResponse(ctx);

    if (!shouldContinue) break;
  }
}

function buildRequestBody(ctx: SessionContext): Record<string, unknown> {
  const { messages, model, tools, options } = ctx;

  const body: Record<string, unknown> = {
    model,
    messages,
    tools,
  };

  if (options.thinking || options.thinkingBudget != null) {
    const reasoning: OpenRouterReasoningConfig = {};

    if (options.thinkingBudget != null) {
      reasoning.max_tokens = options.thinkingBudget;
    } else {
      reasoning.effort = "medium";
    }

    body.reasoning = reasoning;
  }

  if (options.outputTokens != null) {
    body.max_tokens = options.outputTokens;
  }

  if (options.randomness != null) {
    body.temperature = options.randomness;
  }

  if (options.systemPrompt != null) {
    const hasSystem = messages.some((m) => m.role === "system");

    if (!hasSystem) {
      messages.unshift({
        role: "system",
        content: options.systemPrompt,
      });
    }
  }

  return body;
}

async function handleNonStreamingResponse(
  ctx: SessionContext,
): Promise<boolean> {
  const { client, messages, options } = ctx;
  const body = buildRequestBody(ctx);

  if (options.debug || options.verbose) {
    debugCall("chat.completions.create", {
      ...body,
      tools: "[...]",
      messages: `[${messages.length} messages]`,
    });
  }

  const response = (await client.chat.completions.create(
    body as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  )) as unknown as OpenRouterResponse;

  if (options.debug || options.verbose) {
    debugLog(response);
  }

  const choice = response.choices[0];

  if (!choice) {
    console.log("<no response>");

    return false;
  }

  const assistantMessage = choice.message;

  if (assistantMessage.reasoning) {
    console.log(formatThought(assistantMessage.reasoning));
  }

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
      reasoning_details: assistantMessage.reasoning_details,
    });

    for (const toolCall of assistantMessage.tool_calls) {
      await executeToolCall(ctx, toolCall);
    }

    return true;
  }

  if (assistantMessage.content) {
    console.log(assistantMessage.content);
  }

  messages.push({
    role: "assistant",
    content: assistantMessage.content,
    reasoning_details: assistantMessage.reasoning_details,
  });

  return false;
}

async function handleStreamingResponse(ctx: SessionContext): Promise<boolean> {
  const { client, messages, options } = ctx;
  const body = buildRequestBody(ctx);

  if (options.debug || options.verbose) {
    debugCall("chat.completions.create (stream)", {
      ...body,
      tools: "[...]",
      messages: `[${messages.length} messages]`,
    });
  }

  const stream = await client.chat.completions.create({
    ...body,
    stream: true,
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  const state = {
    inThought: false,
    currentContent: "",
    currentReasoning: "",
    toolCalls: new Map<
      number,
      { id: string; name: string; arguments: string }
    >(),
    reasoningDetails: [] as ReasoningDetail[],
  };

  for await (const chunk of stream as AsyncIterable<OpenRouterStreamChunk>) {
    if (options.debug || options.verbose) {
      console.log(DEBUG_SEPARATOR);
      debugLog(chunk);
    }

    processStreamChunk(chunk, state);
  }

  if (state.inThought) {
    process.stdout.write(endThought());
  }

  console.log();

  if (state.toolCalls.size > 0) {
    return await handleToolCalls(ctx, state);
  }

  messages.push({
    role: "assistant",
    content: state.currentContent || null,
    reasoning: state.currentReasoning || undefined,
    reasoning_details:
      state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
  });

  return false;
}

interface StreamState {
  inThought: boolean;
  currentContent: string;
  currentReasoning: string;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  reasoningDetails: ReasoningDetail[];
}

function writeThoughtText(text: string, state: StreamState): void {
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

function processStreamChunk(
  chunk: OpenRouterStreamChunk,
  state: StreamState,
): void {
  const delta = chunk.choices[0]?.delta;

  if (!delta) return;

  if (delta.reasoning) {
    writeThoughtText(delta.reasoning, state);
  }

  if (delta.reasoning_details) {
    processReasoningDetails(delta.reasoning_details, state);
  }

  if (delta.content) {
    processContent(delta.content, state);
  }

  if (delta.tool_calls) {
    processToolCallDeltas(delta.tool_calls, state);
  }
}

async function handleToolCalls(
  ctx: SessionContext,
  state: StreamState,
): Promise<boolean> {
  const { messages } = ctx;
  const toolCallsArray: OpenRouterToolCall[] = Array.from(
    state.toolCalls.values(),
  ).map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: {
      name: tc.name,
      arguments: tc.arguments,
    },
  }));

  messages.push({
    role: "assistant",
    content: state.currentContent || null,
    tool_calls: toolCallsArray,
    reasoning: state.currentReasoning || undefined,
    reasoning_details:
      state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
  });

  for (const toolCall of toolCallsArray) {
    await executeToolCall(ctx, toolCall);
  }

  return true;
}

async function executeToolCall(
  ctx: SessionContext,
  toolCall: OpenRouterToolCall,
): Promise<void> {
  const { mcpClient, messages } = ctx;
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
    const resultText = extractToolResultText(result);

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
