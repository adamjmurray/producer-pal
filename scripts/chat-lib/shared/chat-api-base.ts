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
import { createReadline, runChatLoop } from "./readline.ts";
import type {
  ChatOptions,
  ChatTool,
  OpenRouterMessage,
  OpenRouterResponse,
  OpenRouterStreamChunk,
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

  const model = options.model ?? config.defaultModel;
  const client = config.createClient(apiKey);

  const rl = createReadline();
  const { client: mcpClient } = await connectMcp();
  const tools = await getMcpToolsForChat(mcpClient);

  console.log(`Model: ${model}`);
  console.log(`Provider: ${config.providerName}`);
  console.log("Starting conversation (type 'exit', 'quit', or 'bye' to end)\n");

  const messages: OpenRouterMessage[] = [];

  try {
    await runChatLoop(
      { client, mcpClient, tools, messages, model, options, config },
      rl,
      { initialText, once: options.once },
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

async function sendMessageChat(
  ctx: ChatSessionContext,
  input: string,
  turnCount: number,
): Promise<void> {
  const { messages, options } = ctx;

  messages.push({
    role: "user",
    content: input,
  });

  console.log(`\n[Turn ${turnCount}] Assistant:`);

  while (true) {
    const shouldContinue = options.stream
      ? await handleStreamingResponse(ctx)
      : await handleNonStreamingResponse(ctx);

    if (!shouldContinue) break;
  }
}

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

async function handleNonStreamingResponse(
  ctx: ChatSessionContext,
): Promise<boolean> {
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
      await executeToolCall(ctx.mcpClient, messages, toolCall);
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

async function handleStreamingResponse(
  ctx: ChatSessionContext,
): Promise<boolean> {
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

    for (const toolCall of toolCallsArray) {
      await executeToolCall(ctx.mcpClient, messages, toolCall);
    }

    return true;
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
