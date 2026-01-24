/**
 * OpenAI-compatible session adapter for evaluations
 * Supports both OpenAI and OpenRouter providers
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import OpenAI from "openai";
import { DEFAULT_MODEL as DEFAULT_OPENAI_MODEL } from "#evals/chat/openai/config.ts";
import { DEFAULT_MODEL as DEFAULT_OPENROUTER_MODEL } from "#evals/chat/openrouter/config.ts";
import {
  createStreamState,
  processStreamChunk,
  buildToolCallsArray,
  executeToolCall,
} from "#evals/chat/shared/chat-streaming.ts";
import { endThought } from "#evals/chat/shared/formatting.ts";
import { getMcpToolsForChat } from "#evals/chat/shared/mcp.ts";
import type {
  ChatTool,
  OpenRouterMessage,
  OpenRouterStreamChunk,
  OpenRouterToolCall,
} from "#evals/chat/shared/types.ts";
import type { TurnResult } from "../types.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Provider configuration for OpenAI-compatible APIs */
export interface OpenAIProviderConfig {
  apiKeyEnvVar: string;
  providerName: string;
  defaultModel: string;
  createClient: (apiKey: string) => OpenAI;
}

export const OPENAI_CONFIG: OpenAIProviderConfig = {
  apiKeyEnvVar: "OPENAI_KEY",
  providerName: "OpenAI",
  defaultModel: DEFAULT_OPENAI_MODEL,
  createClient: (apiKey: string) => new OpenAI({ apiKey }),
};

export const OPENROUTER_CONFIG: OpenAIProviderConfig = {
  apiKeyEnvVar: "OPENROUTER_KEY",
  providerName: "OpenRouter",
  defaultModel: DEFAULT_OPENROUTER_MODEL,
  createClient: (apiKey: string) =>
    new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL }),
};

interface OpenAIEvalSessionOptions {
  model?: string;
  instructions?: string;
}

/** Session interface matching EvalSession.sendMessage signature */
export interface OpenAIEvalSession {
  sendMessage: (message: string, turnNumber: number) => Promise<TurnResult>;
  close: () => Promise<void>;
}

/**
 * Create an OpenAI-compatible evaluation session
 *
 * @param mcpClient - MCP client for tool calls
 * @param config - Provider configuration
 * @param options - Session options
 * @returns Evaluation session
 */
export async function createOpenAIEvalSession(
  mcpClient: Client,
  config: OpenAIProviderConfig,
  options: OpenAIEvalSessionOptions,
): Promise<OpenAIEvalSession> {
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    throw new Error(`API key for ${config.providerName} is not set`);
  }

  const client = config.createClient(apiKey);
  const model = options.model ?? config.defaultModel;
  const tools = await getMcpToolsForChat(mcpClient);

  const messages: OpenRouterMessage[] = [];

  if (options.instructions) {
    messages.push({ role: "system", content: options.instructions });
  }

  return {
    sendMessage: (message: string, turnNumber: number) =>
      sendOpenAIMessage(
        client,
        mcpClient,
        messages,
        tools,
        model,
        message,
        turnNumber,
      ),
    close: async () => {
      // OpenAI client doesn't need explicit cleanup
    },
  };
}

/**
 * Send a message with streaming output and tool call handling
 *
 * @param client - OpenAI client
 * @param mcpClient - MCP client for tool calls
 * @param messages - Conversation message history
 * @param tools - Available tools
 * @param model - Model to use
 * @param message - User message to send
 * @param turnNumber - Turn number for logging
 * @returns Turn result with text and tool calls
 */
async function sendOpenAIMessage(
  client: OpenAI,
  mcpClient: Client,
  messages: OpenRouterMessage[],
  tools: ChatTool[],
  model: string,
  message: string,
  turnNumber: number,
): Promise<TurnResult> {
  console.log(`\n[Turn ${turnNumber}] User: ${message}`);
  console.log(`[Turn ${turnNumber}] Assistant:`);

  messages.push({ role: "user", content: message });

  let text = "";
  const allToolCalls: TurnResult["toolCalls"] = [];

  // Tool call loop - continue until no more tool calls
  while (true) {
    const result = await streamResponse(
      client,
      mcpClient,
      messages,
      tools,
      model,
    );

    text += result.text;
    allToolCalls.push(...result.toolCalls);

    if (!result.hasToolCalls) break;
  }

  return { text, toolCalls: allToolCalls };
}

interface StreamResult {
  text: string;
  toolCalls: TurnResult["toolCalls"];
  hasToolCalls: boolean;
}

/**
 * Stream a single response and handle tool calls
 *
 * @param client - OpenAI client
 * @param mcpClient - MCP client for tool calls
 * @param messages - Conversation message history
 * @param tools - Available tools
 * @param model - Model to use
 * @returns Stream result with text, tool calls, and continuation flag
 */
async function streamResponse(
  client: OpenAI,
  mcpClient: Client,
  messages: OpenRouterMessage[],
  tools: ChatTool[],
  model: string,
): Promise<StreamResult> {
  const stream = await client.chat.completions.create({
    model,
    messages: messages as Parameters<
      typeof client.chat.completions.create
    >[0]["messages"],
    tools,
    stream: true,
  });

  const state = createStreamState();

  for await (const chunk of stream as AsyncIterable<OpenRouterStreamChunk>) {
    processStreamChunk(chunk, state);
  }

  finishStreamOutput(state);

  const hasToolCalls = state.toolCalls.size > 0;
  const toolCallsArray = hasToolCalls ? buildToolCallsArray(state) : [];

  messages.push({
    role: "assistant",
    content: state.currentContent || null,
    ...(hasToolCalls && { tool_calls: toolCallsArray }),
  });

  if (!hasToolCalls) {
    return { text: state.currentContent, toolCalls: [], hasToolCalls: false };
  }

  const toolCalls = await executeToolCalls(mcpClient, messages, toolCallsArray);

  return { text: state.currentContent, toolCalls, hasToolCalls: true };
}

/**
 * Finish stream output by ending thought mode and adding newline
 *
 * @param state - Stream state
 * @param state.inThought - Whether currently in thought mode
 */
function finishStreamOutput(state: { inThought: boolean }): void {
  if (state.inThought) {
    process.stdout.write(endThought());
  }

  process.stdout.write("\n");
}

/**
 * Execute tool calls and append results to messages
 *
 * @param mcpClient - MCP client for tool calls
 * @param messages - Conversation message history to append results to
 * @param toolCalls - Tool calls to execute
 * @returns Array of tool call results
 */
async function executeToolCalls(
  mcpClient: Client,
  messages: OpenRouterMessage[],
  toolCalls: OpenRouterToolCall[],
): Promise<TurnResult["toolCalls"]> {
  const results: TurnResult["toolCalls"] = [];
  const startIdx = messages.length;

  for (const toolCall of toolCalls) {
    await executeToolCall(mcpClient, messages, toolCall);
  }

  // Extract results from the added tool messages
  for (const [i, tc] of toolCalls.entries()) {
    const msg = messages[startIdx + i];

    let args: Record<string, unknown>;

    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      args = {};
    }

    results.push({
      name: tc.function.name,
      args,
      result: msg?.content ?? "",
    });
  }

  return results;
}
