/**
 * Anthropic session adapter for evaluations
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DEFAULT_MODEL } from "#evals/chat/anthropic/config.ts";
import { handleStreamingResponse } from "#evals/chat/anthropic/streaming.ts";
import {
  convertMcpToolsToAnthropic,
  processAnthropicToolCalls,
} from "#evals/chat/anthropic/tool-helpers.ts";
import { getMcpToolsForAnthropic } from "#evals/chat/shared/mcp.ts";
import type { TurnResult } from "../types.ts";

const DEFAULT_MAX_TOKENS = 8192;

/** Provider configuration for Anthropic */
export interface AnthropicProviderConfig {
  apiKeyEnvVar: string;
  providerName: string;
  defaultModel: string;
}

export const ANTHROPIC_CONFIG: AnthropicProviderConfig = {
  apiKeyEnvVar: "ANTHROPIC_KEY",
  providerName: "Anthropic",
  defaultModel: DEFAULT_MODEL,
};

interface AnthropicEvalSessionOptions {
  model?: string;
  instructions?: string;
}

/** Session interface matching EvalSession.sendMessage signature */
export interface AnthropicEvalSession {
  sendMessage: (message: string, turnNumber: number) => Promise<TurnResult>;
  close: () => Promise<void>;
}

/**
 * Create an Anthropic evaluation session
 *
 * @param mcpClient - MCP client for tool calls
 * @param options - Session options
 * @returns Evaluation session
 */
export async function createAnthropicEvalSession(
  mcpClient: Client,
  options: AnthropicEvalSessionOptions,
): Promise<AnthropicEvalSession> {
  const apiKey = process.env[ANTHROPIC_CONFIG.apiKeyEnvVar];

  if (!apiKey) {
    throw new Error(`API key for ${ANTHROPIC_CONFIG.providerName} is not set`);
  }

  const client = new Anthropic({ apiKey });
  const model = options.model ?? ANTHROPIC_CONFIG.defaultModel;
  const mcpTools = await getMcpToolsForAnthropic(mcpClient);
  const tools = convertMcpToolsToAnthropic(mcpTools);

  const messages: MessageParam[] = [];
  const systemInstruction = options.instructions;

  return {
    sendMessage: (message: string, turnNumber: number) =>
      sendAnthropicMessage(
        client,
        mcpClient,
        messages,
        tools,
        model,
        systemInstruction,
        message,
        turnNumber,
      ),
    close: async () => {
      // Anthropic client doesn't need explicit cleanup
    },
  };
}

/**
 * Send a message with streaming output and tool call handling
 *
 * @param client - Anthropic client
 * @param mcpClient - MCP client for tool calls
 * @param messages - Conversation message history
 * @param tools - Available tools
 * @param model - Model to use
 * @param systemInstruction - Optional system instruction
 * @param message - User message to send
 * @param turnNumber - Turn number for logging
 * @returns Turn result with text and tool calls
 */
async function sendAnthropicMessage(
  client: Anthropic,
  mcpClient: Client,
  messages: MessageParam[],
  tools: Tool[],
  model: string,
  systemInstruction: string | undefined,
  message: string,
  turnNumber: number,
): Promise<TurnResult> {
  console.log(`\n[Turn ${turnNumber}] User: ${message}`);
  console.log(`[Turn ${turnNumber}] Assistant:`);

  messages.push({ role: "user", content: message });

  let text = "";
  const allToolCalls: TurnResult["toolCalls"] = [];

  // Tool call loop - continue until no more tool_use blocks
  while (true) {
    const requestBody: Anthropic.MessageCreateParams = {
      model,
      messages,
      tools,
      max_tokens: DEFAULT_MAX_TOKENS,
    };

    if (systemInstruction) {
      requestBody.system = systemInstruction;
    }

    const result = await handleStreamingResponse(client, requestBody, false);
    const response = result.response;

    text += result.text;
    allToolCalls.push(...result.toolCalls);

    // Process any tool calls and update message history
    const toolResult = await processAnthropicToolCalls(
      response.content,
      mcpClient,
      messages,
      allToolCalls,
    );

    if (!toolResult.hasToolCalls) {
      break;
    }
  }

  // Add final assistant response to history (text only)
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== "assistant") {
    messages.push({ role: "assistant", content: text });
  }

  return { text, toolCalls: allToolCalls };
}
