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
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import { getMcpUrl } from "#webui/utils/mcp-url";
import {
  type AiSdkClientConfig,
  type AiSdkMessage,
  type TokenUsage,
  toTokenUsage,
} from "./ai-sdk-types";
import { createAiSdkMcpTools } from "./mcp-tools";

const MAX_TOOL_STEPS = 10;

/**
 * AI SDK client that wraps streamText for chat with MCP tool support.
 * Implements the ChatClient<AiSdkMessage> interface expected by useChat.
 */
export class AiSdkClient {
  chatHistory: AiSdkMessage[];
  totalUsage: TokenUsage | null = null;
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
   * @param overrides - Per-message overrides for thinking
   * @yields Complete chat history after each stream update
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    overrides?: MessageOverrides,
  ): AsyncGenerator<AiSdkMessage[], void, unknown> {
    const userMsg: AiSdkMessage = { role: "user", content: message };

    stampOverrides(userMsg, overrides);
    this.chatHistory.push(userMsg);
    yield [...this.chatHistory];

    const providerOptions =
      overrides?.thinking != null && this.config.buildProviderOptions
        ? this.config.buildProviderOptions(overrides.thinking)
        : this.config.providerOptions;

    const result = streamText({
      model: this.config.model,
      system: this.config.systemInstruction,
      messages: buildModelMessages(this.chatHistory),
      tools: Object.keys(this.tools).length > 0 ? this.tools : undefined,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      temperature: this.config.temperature,
      providerOptions,
      abortSignal,
    });

    const historyLengthBefore = this.chatHistory.length;

    yield* this.processStream(result);
    yield* this.captureResponseMetadata(result, historyLengthBefore);
  }

  /**
   * Capture response metadata (model ID, token usage) and attach to assistant
   * messages created during the current turn.
   * @param result - The streamText result
   * @param historyLengthBefore - Chat history length before streaming started
   * @yields Updated chat history if metadata was captured
   */
  private async *captureResponseMetadata(
    result: ReturnType<typeof streamText>,
    historyLengthBefore: number,
  ): AsyncGenerator<AiSdkMessage[]> {
    try {
      const [response, totalUsage, steps] = await Promise.all([
        result.response,
        result.totalUsage,
        result.steps,
      ]);

      this.totalUsage = toTokenUsage(totalUsage);

      // Zip steps with assistant messages from this turn (1:1 ordering)
      let stepIdx = 0;

      for (let i = historyLengthBefore; i < this.chatHistory.length; i++) {
        const msg = this.chatHistory[i] as AiSdkMessage;

        if (msg.role === "assistant") {
          if (response.modelId) {
            msg.responseModel = response.modelId;
          }

          const step = steps[stepIdx];

          if (step) {
            msg.usage = toTokenUsage(step.usage);
          }

          stepIdx++;
        }
      }
    } catch {
      // Stream may have been aborted — response metadata not available
    }

    yield [...this.chatHistory];
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
 * Stamp per-message setting overrides onto a user message.
 * Only sets fields that are present in the overrides.
 * @param msg - User message to stamp
 * @param overrides - Per-message overrides (undefined = no overrides)
 */
function stampOverrides(msg: AiSdkMessage, overrides?: MessageOverrides): void {
  if (!overrides) return;

  if (overrides.thinking != null) msg.thinkingOverride = overrides.thinking;
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
    // If tool-input-start already created an entry, update it with parsed args
    const existing = msg.toolCalls.find(
      (tc) => tc.id === (part.toolCallId as string),
    );

    if (existing) {
      existing.args = part.input as Record<string, unknown>;
    } else {
      msg.toolCalls.push({
        id: part.toolCallId as string,
        name: part.toolName as string,
        args: part.input as Record<string, unknown>,
      });
    }

    return true;
  }

  // Chat Completions models stream tool calls as tool-input-start + tool-input-delta
  if (type === "tool-input-start") {
    msg.toolCalls ??= [];
    msg.toolCalls.push({
      id: part.id as string,
      name: part.toolName as string,
      args: {},
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
      result: extractErrorMessage(part.error),
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

/**
 * Extract a displayable message from a tool-error part's error value.
 * The AI SDK may pass an Error object (which JSON.stringify turns into "{}").
 * @param error - Error value from stream part (Error object or string)
 * @returns Error message string
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  return String(error);
}
