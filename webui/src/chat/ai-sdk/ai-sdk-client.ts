// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
  type ToolSet,
  stepCountIs,
  streamText,
} from "ai";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat";
import { getMcpUrl } from "#webui/utils/mcp-url";
import { type AiSdkClientConfig, type AiSdkMessage } from "./ai-sdk-types";
import { createAiSdkMcpTools } from "./mcp-tools";

const MAX_TOOL_STEPS = 10;

/**
 * AI SDK client that wraps streamText for chat with MCP tool support.
 * Implements the ChatClient<AiSdkMessage> interface expected by useChat.
 */
export class AiSdkClient {
  chatHistory: AiSdkMessage[];
  private tools: ToolSet = {};
  private config: AiSdkClientConfig;

  /**
   * @param _apiKey - API key (handled by the model instance in config)
   * @param config - Client configuration
   */
  constructor(_apiKey: string, config: AiSdkClientConfig) {
    this.config = config;
    this.chatHistory = config.chatHistory ?? [];
  }

  /**
   * Initialize MCP connection and convert tools to AI SDK format.
   */
  async initialize(): Promise<void> {
    const mcpUrl = this.config.mcpUrl ?? getMcpUrl();
    const { tools } = await createAiSdkMcpTools(
      mcpUrl,
      this.config.enabledTools,
    );

    this.tools = tools;
  }

  /**
   * Send a message and stream back the evolving chat history.
   * The AI SDK handles multi-step tool calling via stopWhen.
   * @param message - User message text
   * @param abortSignal - Signal to abort the stream
   * @param _overrides - Per-message overrides (reserved for future use)
   * @yields Complete chat history after each stream update
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    _overrides?: MessageOverrides,
  ): AsyncGenerator<AiSdkMessage[], void, unknown> {
    this.chatHistory.push({ role: "user", content: message });
    yield [...this.chatHistory];

    const result = streamText({
      model: this.config.model,
      system: this.config.systemInstruction,
      messages: buildModelMessages(this.chatHistory),
      tools: Object.keys(this.tools).length > 0 ? this.tools : undefined,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      temperature: this.config.temperature,
      providerOptions: this.config.providerOptions,
      abortSignal,
    });

    yield* this.processStream(result);
  }

  /**
   * Process the fullStream from streamText and yield chat history updates.
   * @param result - The streamText result
   * @yields Updated chat history after each meaningful stream event
   */
  private async *processStream(
    result: ReturnType<typeof streamText>,
  ): AsyncGenerator<AiSdkMessage[]> {
    let currentMsg: AiSdkMessage = { role: "assistant", content: "" };
    let addedCurrentMsg = false;

    for await (const part of result.fullStream) {
      const handled = handleStreamPart(part.type, part, currentMsg);

      if (handled) {
        if (!addedCurrentMsg) {
          this.chatHistory.push(currentMsg);
          addedCurrentMsg = true;
        }

        yield [...this.chatHistory];
      } else if (part.type === "start-step" && addedCurrentMsg) {
        // New step means new assistant turn (after tool results)
        currentMsg = { role: "assistant", content: "" };
        addedCurrentMsg = false;
      }
    }
  }
}

/**
 * Handle a single stream part, updating the current message.
 * @param type - Stream part type
 * @param part - The full stream part object
 * @param msg - Current assistant message to update
 * @returns True if content was added (should yield)
 */
function handleStreamPart(
  type: string,
  part: Record<string, unknown>,
  msg: AiSdkMessage,
): boolean {
  if (type === "text-delta") {
    msg.content += part.text as string;

    return true;
  }

  if (type === "reasoning-delta") {
    msg.reasoning = (msg.reasoning ?? "") + (part.text as string);

    return true;
  }

  if (type === "tool-call") {
    msg.toolCalls ??= [];
    msg.toolCalls.push({
      id: part.toolCallId as string,
      name: part.toolName as string,
      args: part.input as Record<string, unknown>,
    });

    return true;
  }

  if (type === "tool-result") {
    msg.toolResults ??= [];
    msg.toolResults.push({
      id: part.toolCallId as string,
      name: part.toolName as string,
      args: part.input as Record<string, unknown>,
      result: part.output,
      isError: false,
    });

    return true;
  }

  if (type === "tool-error") {
    msg.toolResults ??= [];
    msg.toolResults.push({
      id: part.toolCallId as string,
      name: part.toolName as string,
      args: part.input as Record<string, unknown>,
      result: part.error,
      isError: true,
    });

    return true;
  }

  return false;
}

/**
 * Convert chat history to AI SDK ModelMessage format.
 * Assistant messages with tool calls produce two ModelMessages:
 * 1. assistant message with text + tool-call parts
 * 2. tool message with tool-result parts
 * @param history - Chat history to convert
 * @returns Array of ModelMessage for streamText
 */
function buildModelMessages(history: AiSdkMessage[]): ModelMessage[] {
  const messages: ModelMessage[] = [];

  for (const msg of history) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
      continue;
    }

    if (!msg.toolCalls || msg.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }

    // Assistant message with tool calls
    messages.push({
      role: "assistant",
      content: buildAssistantContent(msg),
    });

    // Tool results message (required by AI SDK for multi-turn)
    if (msg.toolResults && msg.toolResults.length > 0) {
      messages.push({
        role: "tool",
        content: buildToolResultContent(msg.toolResults),
      });
    }
  }

  return messages;
}

/**
 * Build tool result content for the tool role message.
 * @param toolResults - Tool results from the assistant message
 * @returns Array of ToolResultPart for the tool message
 */
function buildToolResultContent(
  toolResults: NonNullable<AiSdkMessage["toolResults"]>,
): ToolResultPart[] {
  return toolResults.map((tr) => ({
    type: "tool-result" as const,
    toolCallId: tr.id,
    toolName: tr.name,
    output:
      typeof tr.result === "string"
        ? { type: "text" as const, value: tr.result }
        : { type: "text" as const, value: JSON.stringify(tr.result) },
  }));
}

/**
 * Build typed AI SDK content parts for an assistant message with tool calls.
 * @param msg - Assistant message with tool calls
 * @returns Structured content array
 */
function buildAssistantContent(
  msg: AiSdkMessage,
): Array<TextPart | ToolCallPart> {
  const parts: Array<TextPart | ToolCallPart> = [];

  if (msg.content) {
    parts.push({ type: "text", text: msg.content });
  }

  for (const tc of msg.toolCalls ?? []) {
    parts.push({
      type: "tool-call",
      toolCallId: tc.id,
      toolName: tc.name,
      input: tc.args,
    });
  }

  return parts;
}
