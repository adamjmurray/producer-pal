/**
 * Shared Chat API base implementation for OpenAI-compatible providers
 *
 * This module provides common streaming/non-streaming response handling,
 * message formatting, and session management used by both OpenAI and OpenRouter
 * Chat API implementations.
 */

import type OpenAI from "openai";
import {
  createStreamState,
  processStreamChunk,
  buildToolCallsArray,
  executeToolCall,
} from "./chat-streaming.ts";
import {
  formatThought,
  debugLog,
  debugCall,
  DEBUG_SEPARATOR,
  endThought,
} from "./formatting.ts";
import { connectMcp, getMcpToolsForChat } from "./mcp.ts";
import { createMessageSource } from "./message-source.ts";
import { createReadline, runChatLoop } from "./readline.ts";
import type {
  ChatOptions,
  ChatTool,
  OpenRouterMessage,
  OpenRouterResponse,
  OpenRouterStreamChunk,
  TurnResult,
} from "./types.ts";

/**
 * Provider-specific configuration for Chat API implementations
 */
export interface ChatProviderConfig {
  /** Environment variable name for API key */
  apiKeyEnvVar: string;
  /** Display name for the provider */
  providerName: string;
  /** Default model to use */
  defaultModel: string;
  /** Create the OpenAI-compatible client */
  createClient: (apiKey: string) => OpenAI;
  /** Build reasoning/thinking configuration for request body */
  buildReasoningConfig: (
    thinkingLevel: string,
  ) => Record<string, unknown> | undefined;
}

export interface ChatSessionContext {
  client: OpenAI;
  mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];
  tools: ChatTool[];
  messages: OpenRouterMessage[];
  model: string;
  options: ChatOptions;
  config: ChatProviderConfig;
}

interface RequestBody {
  model: string;
  messages: OpenRouterMessage[];
  tools?: ChatTool[];
  reasoning_effort?: string;
  reasoning?: Record<string, unknown>;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Run an interactive chat session with a Chat API provider
 *
 * @param initialText - Optional initial text to start the conversation
 * @param options - Chat configuration options
 * @param config - Provider-specific configuration
 */
export async function runChatSession(
  initialText: string,
  options: ChatOptions,
  config: ChatProviderConfig,
): Promise<void> {
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    console.error(`Error: API key for ${config.providerName} is not set`);
    process.exit(1);
  }

  const model = options.model;
  const client = config.createClient(apiKey);

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForChat(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: ${config.providerName}`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messages: OpenRouterMessage[] = [];
  const messageSource = createMessageSource(rl, options, initialText);

  try {
    await runChatLoop(
      { client, mcpClient, tools, messages, model, options, config },
      messageSource,
      { once: options.once },
      { sendMessage: sendMessageChat },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Error:", message);

    if (options.debug) {
      console.error(error);
    }

    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Sends a message in a Chat API session
 *
 * @param ctx - Session context with client and messages
 * @param input - User input text
 * @param turnCount - Current conversation turn number
 * @returns Turn result with response text and tool calls
 */
async function sendMessageChat(
  ctx: ChatSessionContext,
  input: string,
  turnCount: number,
): Promise<TurnResult> {
  const { messages, options } = ctx;
  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];

  messages.push({
    role: "user",
    content: input,
  });

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  while (true) {
    const result = options.stream
      ? await handleStreamingResponse(ctx)
      : await handleNonStreamingResponse(ctx);

    text += result.text;
    toolCalls.push(...result.toolCalls);

    if (!result.shouldContinue) break;
  }

  return { text, toolCalls };
}

/**
 * Builds the Chat API request body from context
 *
 * @param ctx - Session context with messages and options
 * @returns Request body for chat.completions.create
 */
function buildRequestBody(ctx: ChatSessionContext): RequestBody {
  const { messages, model, tools, options, config } = ctx;

  const body: RequestBody = {
    model,
    messages,
    tools,
  };

  if (options.thinking) {
    const reasoningConfig = config.buildReasoningConfig(options.thinking);

    if (reasoningConfig) {
      Object.assign(body, reasoningConfig);
    }
  }

  if (options.outputTokens != null) {
    body.max_tokens = options.outputTokens;
  }

  if (options.randomness != null) {
    body.temperature = options.randomness;
  }

  if (options.instructions != null) {
    const hasSystem = messages.some((m) => m.role === "system");

    if (!hasSystem) {
      messages.unshift({
        role: "system",
        content: options.instructions,
      });
    }
  }

  return body;
}

interface ResponseHandlerResult {
  text: string;
  toolCalls: TurnResult["toolCalls"];
  shouldContinue: boolean;
}

/**
 * Handles non-streaming Chat API response
 *
 * @param ctx - Session context with client and messages
 * @returns Response result with text, tool calls, and continuation flag
 */
async function handleNonStreamingResponse(
  ctx: ChatSessionContext,
): Promise<ResponseHandlerResult> {
  const { client, messages, options } = ctx;
  const body = buildRequestBody(ctx);

  if (options.debug) {
    debugCall("chat.completions.create", {
      ...body,
      tools: "[...]",
      messages: `[${messages.length} messages]`,
    });
  }

  const response = (await client.chat.completions.create(
    body as Parameters<typeof client.chat.completions.create>[0],
  )) as unknown as OpenRouterResponse;

  if (options.debug) {
    debugLog(response);
  }

  const choice = response.choices[0];

  if (!choice) {
    console.log("<no response>");

    return { text: "", toolCalls: [], shouldContinue: false };
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

    const toolCalls: TurnResult["toolCalls"] = [];

    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments) as Record<
        string,
        unknown
      >;

      toolCalls.push({ name: toolCall.function.name, args });
      await executeToolCall(ctx.mcpClient, messages, toolCall);
    }

    return {
      text: assistantMessage.content ?? "",
      toolCalls,
      shouldContinue: true,
    };
  }

  if (assistantMessage.content) {
    console.log(assistantMessage.content);
  }

  messages.push({
    role: "assistant",
    content: assistantMessage.content,
    reasoning_details: assistantMessage.reasoning_details,
  });

  return {
    text: assistantMessage.content ?? "",
    toolCalls: [],
    shouldContinue: false,
  };
}

/**
 * Handles streaming Chat API response
 *
 * @param ctx - Session context with client and messages
 * @returns Response result with text, tool calls, and continuation flag
 */
async function handleStreamingResponse(
  ctx: ChatSessionContext,
): Promise<ResponseHandlerResult> {
  const { client, messages, options } = ctx;
  const body = buildRequestBody(ctx);

  if (options.debug) {
    debugCall("chat.completions.create (stream)", {
      ...body,
      tools: "[...]",
      messages: `[${messages.length} messages]`,
    });
  }

  const stream = await client.chat.completions.create({
    ...body,
    stream: true,
  } as Parameters<typeof client.chat.completions.create>[0]);

  const state = createStreamState();

  for await (const chunk of stream as AsyncIterable<OpenRouterStreamChunk>) {
    if (options.debug) {
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
    const toolCallsArray = buildToolCallsArray(state);

    messages.push({
      role: "assistant",
      content: state.currentContent || null,
      tool_calls: toolCallsArray,
      reasoning: state.currentReasoning || undefined,
      reasoning_details:
        state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
    });

    const toolCalls: TurnResult["toolCalls"] = [];

    for (const toolCall of toolCallsArray) {
      const args = JSON.parse(toolCall.function.arguments) as Record<
        string,
        unknown
      >;

      toolCalls.push({ name: toolCall.function.name, args });
      await executeToolCall(ctx.mcpClient, messages, toolCall);
    }

    return {
      text: state.currentContent,
      toolCalls,
      shouldContinue: true,
    };
  }

  messages.push({
    role: "assistant",
    content: state.currentContent || null,
    reasoning: state.currentReasoning || undefined,
    reasoning_details:
      state.reasoningDetails.length > 0 ? state.reasoningDetails : undefined,
  });

  return {
    text: state.currentContent,
    toolCalls: [],
    shouldContinue: false,
  };
}
