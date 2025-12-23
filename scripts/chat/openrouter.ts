import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
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
  getMcpToolsForChat,
  getMcpToolsForResponses,
} from "./shared/mcp.ts";
import { createReadline, runChatLoop } from "./shared/readline.ts";
import type {
  ChatOptions,
  OpenRouterMessage,
  OpenRouterReasoningConfig,
  OpenRouterRequestBody,
  OpenRouterResponse,
  OpenRouterStreamChunk,
  OpenRouterTool,
  OpenRouterToolCall,
  ReasoningDetail,
  ResponsesAPIResponse,
  ResponsesConversationItem,
  ResponsesOutputItem,
  ResponsesStreamEvent,
  ResponsesTool,
} from "./shared/types.ts";

// OpenRouter extends OpenAI's API with additional fields like `reasoning`
type OpenRouterNonStreamingParams = ChatCompletionCreateParamsNonStreaming & {
  reasoning?: OpenRouterReasoningConfig;
};

type OpenRouterStreamingParams = ChatCompletionCreateParamsStreaming & {
  reasoning?: OpenRouterReasoningConfig;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const HTTP_REFERER_HEADER = "HTTP-Referer";
const REFERER_URL = "https://producer-pal.org";
const X_TITLE_HEADER = "X-Title";
const APP_TITLE = "Producer Pal CLI";

interface SessionContext {
  client: OpenAI;
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: OpenRouterTool[];
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
 * Run an interactive chat session with OpenRouter
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 */
export async function runOpenRouter(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiStyle = options.api ?? "chat";

  if (apiStyle === "responses") {
    await runOpenRouterResponses(initialText, options);
  } else {
    await runOpenRouterChat(initialText, options);
  }
}

// =============================================================================
// CHAT API IMPLEMENTATION
// =============================================================================

async function runOpenRouterChat(
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
      [HTTP_REFERER_HEADER]: REFERER_URL,
      [X_TITLE_HEADER]: APP_TITLE,
    },
  });

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForChat(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenRouter (Chat API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messages: OpenRouterMessage[] = [];

  try {
    await runChatLoop(
      { client, mcpClient, tools, messages, model, options },
      rl,
      initialText,
      { sendMessage: sendMessageChat },
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

async function sendMessageChat(
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

function buildRequestBody(ctx: SessionContext): OpenRouterRequestBody {
  const { messages, model, tools, options } = ctx;

  const body: OpenRouterRequestBody = {
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
    body as OpenRouterNonStreamingParams,
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
  } as OpenRouterStreamingParams);

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

// =============================================================================
// RESPONSES API IMPLEMENTATION
// =============================================================================

const OPENROUTER_RESPONSES_URL = "https://openrouter.ai/api/v1/responses";

interface ResponsesSessionContext {
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: ResponsesTool[];
  conversation: ResponsesConversationItem[];
  model: string;
  options: ChatOptions;
}

async function runOpenRouterResponses(
  initialText: string,
  options: ChatOptions,
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY environment variable is required");
    process.exit(1);
  }

  const model = options.model ?? DEFAULT_MODEL;

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForResponses(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: OpenRouter (Responses API)`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const conversation: ResponsesConversationItem[] = [];

  try {
    await runChatLoop(
      { mcpClient, tools, conversation, model, options },
      rl,
      initialText,
      { sendMessage: sendMessageResponses },
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

async function sendMessageResponses(
  ctx: ResponsesSessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
  const { conversation, options } = ctx;

  conversation.push({
    type: "message",
    role: "user",
    content: input,
  });

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const shouldContinue = options.stream
      ? await handleResponsesStreaming(ctx)
      : await handleResponsesNonStreaming(ctx);

    if (!shouldContinue) break;
  }
}

interface ResponsesRequestBody {
  model: string;
  input: ResponsesConversationItem[];
  tools?: ResponsesTool[];
  reasoning?: OpenRouterReasoningConfig;
  max_output_tokens?: number;
  temperature?: number;
  instructions?: string;
  stream?: boolean;
}

function buildResponsesRequestBody(
  ctx: ResponsesSessionContext,
): ResponsesRequestBody {
  const { conversation, model, tools, options } = ctx;

  const body: ResponsesRequestBody = {
    model,
    input: conversation,
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
    body.max_output_tokens = options.outputTokens;
  }

  if (options.randomness != null) {
    body.temperature = options.randomness;
  }

  if (options.systemPrompt != null) {
    body.instructions = options.systemPrompt;
  }

  return body;
}

async function handleResponsesNonStreaming(
  ctx: ResponsesSessionContext,
): Promise<boolean> {
  const { options } = ctx;
  const body = buildResponsesRequestBody(ctx);

  if (options.debug || options.verbose) {
    debugCall("responses (non-streaming)", {
      ...body,
      tools: "[...]",
      input: `[${ctx.conversation.length} items]`,
    });
  }

  const response = await fetch(OPENROUTER_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      [HTTP_REFERER_HEADER]: REFERER_URL,
      [X_TITLE_HEADER]: APP_TITLE,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Responses API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ResponsesAPIResponse;

  if (options.debug || options.verbose) {
    debugLog(data);
  }

  return await processResponsesOutput(ctx, data.output);
}

function parseSseLines(
  lines: string[],
  options: ChatOptions,
  state: ResponsesStreamState,
): void {
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;

    const data = line.slice(6);

    if (data === "[DONE]") continue;

    try {
      const event = JSON.parse(data) as ResponsesStreamEvent;

      if (options.debug || options.verbose) {
        console.log(DEBUG_SEPARATOR);
        debugLog(event);
      }

      processResponsesStreamEvent(event, state);
    } catch {
      // Skip invalid JSON
    }
  }
}

async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: ChatOptions,
  state: ResponsesStreamState,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");

    buffer = lines.pop() ?? "";

    parseSseLines(lines, options, state);
  }
}

async function handleResponsesStreaming(
  ctx: ResponsesSessionContext,
): Promise<boolean> {
  const { options } = ctx;
  const body = { ...buildResponsesRequestBody(ctx), stream: true };

  if (options.debug || options.verbose) {
    debugCall("responses (streaming)", {
      ...body,
      tools: "[...]",
      input: `[${ctx.conversation.length} items]`,
    });
  }

  const response = await fetch(OPENROUTER_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      [HTTP_REFERER_HEADER]: REFERER_URL,
      [X_TITLE_HEADER]: APP_TITLE,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Responses API error: ${response.status} ${errorText}`);
  }

  const state: ResponsesStreamState = {
    inThought: false,
    currentContent: "",
    currentReasoning: "",
    functionCalls: new Map<string, { name: string; arguments: string }>(),
  };

  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("No response body");
  }

  await readSseStream(reader, options, state);

  if (state.inThought) {
    process.stdout.write(endThought());
  }

  console.log();

  if (state.functionCalls.size > 0) {
    return await handleResponsesFunctionCalls(ctx, state);
  }

  if (state.currentContent) {
    ctx.conversation.push({
      type: "message",
      role: "assistant",
      content: state.currentContent,
    });
  }

  return false;
}

interface ResponsesStreamState {
  inThought: boolean;
  currentContent: string;
  currentReasoning: string;
  functionCalls: Map<string, { name: string; arguments: string }>;
}

function processResponsesStreamEvent(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
): void {
  if (event.type === "response.reasoning.delta" && event.delta?.text) {
    state.currentReasoning += event.delta.text;

    if (!state.inThought) {
      process.stdout.write(startThought(event.delta.text));
      state.inThought = true;
    } else {
      process.stdout.write(continueThought(event.delta.text));
    }
  }

  if (event.type === "response.output_text.delta" && event.delta?.text) {
    if (state.inThought) {
      process.stdout.write(endThought());
      state.inThought = false;
    }

    process.stdout.write(event.delta.text);
    state.currentContent += event.delta.text;
  }

  if (event.type === "response.function_call_arguments.delta") {
    const callId = event.call_id ?? "";
    const existing = state.functionCalls.get(callId);

    if (existing) {
      existing.arguments += event.arguments ?? "";
    } else {
      state.functionCalls.set(callId, {
        name: event.name ?? "",
        arguments: event.arguments ?? "",
      });
    }
  }
}

async function handleResponsesFunctionCalls(
  ctx: ResponsesSessionContext,
  state: ResponsesStreamState,
): Promise<boolean> {
  const { conversation } = ctx;

  for (const [callId, fc] of state.functionCalls) {
    const functionCallItem: ResponsesConversationItem = {
      type: "function_call",
      id: `fc_${callId}`,
      call_id: callId,
      name: fc.name,
      arguments: fc.arguments,
    };

    conversation.push(functionCallItem);

    await executeResponsesToolCall(ctx, callId, fc.name, fc.arguments);
  }

  return true;
}

async function executeResponsesToolCall(
  ctx: ResponsesSessionContext,
  callId: string,
  name: string,
  argsJson: string,
): Promise<void> {
  const { mcpClient, conversation } = ctx;

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

    conversation.push({
      type: "function_call_output",
      call_id: callId,
      output: resultText,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.log(formatToolResult(`Error: ${errorMsg}`));

    conversation.push({
      type: "function_call_output",
      call_id: callId,
      output: `Error: ${errorMsg}`,
    });
  }
}

async function processResponsesOutput(
  ctx: ResponsesSessionContext,
  output: ResponsesOutputItem[],
): Promise<boolean> {
  const { conversation } = ctx;
  let hasFunctionCalls = false;

  for (const item of output) {
    if (item.type === "reasoning" && item.summary) {
      console.log(formatThought(item.summary));
    }

    if (item.type === "message" && item.content) {
      const text = item.content
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join("");

      if (text) {
        console.log(text);

        conversation.push({
          type: "message",
          role: "assistant",
          content: text,
        });
      }
    }

    if (item.type === "function_call" && item.name && item.call_id) {
      hasFunctionCalls = true;

      const functionCallItem: ResponsesConversationItem = {
        type: "function_call",
        id: item.id ?? `fc_${item.call_id}`,
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments ?? "{}",
      };

      conversation.push(functionCallItem);

      await executeResponsesToolCall(
        ctx,
        item.call_id,
        item.name,
        item.arguments ?? "{}",
      );
    }
  }

  return hasFunctionCalls;
}
