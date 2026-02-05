// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import OpenAI from "openai";
import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";
import type { ReasoningEffort } from "#webui/hooks/settings/config-builders";
import type { OpenAIMessage, OpenAIToolCall } from "#webui/types/messages";
import { getMcpUrl } from "#webui/utils/mcp-url";
import { isOpenRouterProvider } from "#webui/utils/provider-detection";
import {
  calculateEffectiveSettings,
  type OpenAIMessageOverrides,
} from "./message-overrides";
import {
  processReasoningDelta,
  type OpenAIAssistantMessageWithReasoning,
  type ReasoningDetail,
} from "./reasoning-helpers";

// Re-export for external consumers
export {
  extractReasoningFromDelta,
  processReasoningDelta,
} from "./reasoning-helpers";
export type {
  OpenAIAssistantMessageWithReasoning,
  ReasoningDetail,
} from "./reasoning-helpers";
export type { OpenAIMessageOverrides } from "./message-overrides";

const MCP_NOT_INITIALIZED_ERROR =
  "MCP client not initialized. Call initialize() first.";

// Configuration for OpenAIClient
export interface OpenAIClientConfig {
  mcpUrl?: string;
  model: string;
  temperature?: number;
  systemInstruction?: string;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  excludeReasoning?: boolean;
  chatHistory?: OpenAIMessage[];
  baseUrl?: string;
  enabledTools?: Record<string, boolean>;
}

/**
 * Client for OpenAI-compatible APIs with MCP tool support.
 * Returns chat history in OpenAI's raw format with reasoning_details for thinking content.
 * For UI-friendly format, use formatOpenAIMessages() from openai-formatter.js
 */
export class OpenAIClient {
  ai: OpenAI;
  mcpUrl: string;
  config: OpenAIClientConfig;
  mcpClient: Client | null;
  chatHistory: OpenAIMessage[];

  /**
   * @param {string} apiKey - OpenAI API key (or compatible provider key)
   * @param {OpenAIClientConfig} config - Configuration options
   */
  constructor(apiKey: string, config: OpenAIClientConfig) {
    // Suppress x-stainless headers for non-OpenAI providers (e.g., Mistral)
    // These headers cause CORS issues with some OpenAI-compatible APIs
    const isNonOpenAI =
      config.baseUrl && config.baseUrl !== "https://api.openai.com/v1";

    this.ai = new OpenAI({
      apiKey,
      baseURL: config.baseUrl ?? "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
      ...(isNonOpenAI && {
        defaultHeaders: {
          "X-Stainless-Lang": null,
          "X-Stainless-Package-Version": null,
          "X-Stainless-OS": null,
          "X-Stainless-Arch": null,
          "X-Stainless-Runtime": null,
          "X-Stainless-Runtime-Version": null,
          "X-Stainless-Retry-Count": null,
          "X-Stainless-Timeout": null,
        },
      }),
    });
    this.mcpUrl = config.mcpUrl ?? getMcpUrl();
    this.config = config;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory ?? [];

    // Add system message if provided and not in history
    if (
      config.systemInstruction &&
      this.chatHistory.length === 0 &&
      !this.chatHistory.find((msg) => msg.role === "system")
    ) {
      this.chatHistory.push({
        role: "system",
        content: config.systemInstruction,
      });
    }
  }

  /**
   * Initializes the MCP connection.
   * Must be called before sending messages.
   * @throws If MCP connection fails
   */
  async initialize(): Promise<void> {
    this.mcpClient = await createConnectedMcpClient(this.mcpUrl);
  }

  /**
   * Sends a message to OpenAI and streams back the chat history as it updates.
   * Yields full chat history after each update, executing tool calls automatically.
   * @param {string} message - User message to send
   * @param {AbortSignal} [abortSignal] - Optional abort signal
   * @param {OpenAIMessageOverrides} [overrides] - Optional per-message overrides
   * @yields Complete chat history in OpenAI's raw format after each update
   * @throws If MCP client is not initialized or if message sending fails
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    overrides?: OpenAIMessageOverrides,
  ): AsyncGenerator<OpenAIMessage[], void, unknown> {
    if (!this.mcpClient) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }

    // Add user message
    const userMessage: OpenAIMessage = { role: "user", content: message };

    this.chatHistory.push(userMessage);
    yield this.chatHistory;

    // Get filtered tools
    const tools = await this.getFilteredTools();

    // Calculate effective settings (override or default from config)
    const effectiveSettings = calculateEffectiveSettings(
      overrides,
      this.config,
    );

    // Manual tool calling loop
    let continueLoop = true;
    const maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      // Process the stream and update history with assistant response
      yield* this.processStreamAndUpdateHistory(tools, effectiveSettings);

      // Handle any tool calls from the assistant's response
      const toolCalls = this.getToolCallsFromLastMessage();

      if (toolCalls) {
        yield* this.executeToolCalls(toolCalls);

        if (abortSignal?.aborted) {
          continueLoop = false;
        }
      } else {
        continueLoop = false;
      }
    }

    if (iteration >= maxIterations) {
      console.warn(
        "OpenAI tool calling loop reached max iterations:",
        maxIterations,
      );
    }
  }

  /**
   * Retrieves and filters MCP tools based on enabled settings.
   * @returns {Promise<OpenAI.Chat.ChatCompletionTool[]>} - Filtered tools
   */
  private async getFilteredTools(): Promise<OpenAI.Chat.ChatCompletionTool[]> {
    const toolsResult = await this.mcpClient?.listTools();

    if (!toolsResult) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }

    const filteredTools = filterEnabledTools(
      toolsResult.tools,
      this.config.enabledTools,
    );

    return filteredTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
      },
    }));
  }

  /**
   * Processes the OpenAI stream and updates chat history with each chunk.
   * @param {OpenAI.Chat.ChatCompletionTool[]} tools - Array of available tools
   * @param {object} settings - Effective temperature and reasoning settings
   * @param {number} [settings.temperature] - Temperature value
   * @param {ReasoningEffort} [settings.reasoningEffort] - Reasoning effort level
   * @param {boolean} [settings.excludeReasoning] - Whether to exclude reasoning
   * @returns {AsyncGenerator} - Generator yielding chat history updates
   */
  private async *processStreamAndUpdateHistory(
    tools: OpenAI.Chat.ChatCompletionTool[],
    settings: {
      temperature: number | undefined;
      reasoningEffort: ReasoningEffort | undefined;
      excludeReasoning: boolean | undefined;
    },
  ): AsyncGenerator<OpenAIMessage[]> {
    const stream = await this.ai.chat.completions.create({
      model: this.config.model,
      messages: this.chatHistory,
      tools: tools.length > 0 ? tools : undefined,
      temperature: settings.temperature,
      ...(settings.reasoningEffort
        ? isOpenRouterProvider(this.config.baseUrl)
          ? {
              reasoning: {
                effort: settings.reasoningEffort,
                // Exclude reasoning when effort is "none" or checkbox is unchecked
                ...((settings.reasoningEffort === "none" ||
                  settings.excludeReasoning) && {
                  exclude: true,
                }),
              },
            }
          : { reasoning_effort: settings.reasoningEffort }
        : {}),
      stream: true,
    });

    // Accumulate streaming response
    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "",
    };
    const toolCallsMap = new Map<number, OpenAIToolCall>();
    // Accumulate reasoning blocks by index, preserving full structure for API round-tripping
    const reasoningDetailsMap = new Map<string, ReasoningDetail>();
    let toolCallsFinalized = false; // Track if we've received finish_reason: tool_calls

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      if (!choice) continue;

      const delta = choice.delta;

      // Process delta chunks
      this.processContentDelta(delta, currentMessage);
      processReasoningDelta(delta, reasoningDetailsMap);
      this.processToolCallDeltas(delta, toolCallsMap);

      // Once finalized, preserve tool_calls for subsequent chunks (e.g., OpenRouter usage chunks)
      toolCallsFinalized ||= choice.finish_reason === "tool_calls";

      // Build and update message
      const messageToAdd = this.buildStreamMessage(
        currentMessage,
        toolCallsMap,
        reasoningDetailsMap,
        toolCallsFinalized ? "tool_calls" : choice.finish_reason,
      );

      this.updateChatHistoryWithMessage(messageToAdd);

      yield this.chatHistory;
    }
  }

  /**
   * Processes content delta from a stream chunk.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta} delta - Delta object from stream chunk
   * @param {OpenAIAssistantMessageWithReasoning} currentMessage - Current message being built
   */
  private processContentDelta(
    delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
    currentMessage: OpenAIAssistantMessageWithReasoning,
  ): void {
    if (delta.content) currentMessage.content += delta.content;
  }

  /**
   * Processes tool call deltas from a stream chunk.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta} delta - Delta object from stream chunk
   * @param {Map<number, OpenAIToolCall>} toolCallsMap - Map of tool calls being accumulated
   */
  private processToolCallDeltas(
    delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta,
    toolCallsMap: Map<number, OpenAIToolCall>,
  ): void {
    if (!delta.tool_calls) return;

    for (const tcDelta of delta.tool_calls) {
      this.accumulateToolCall(tcDelta, toolCallsMap);
    }
  }

  /**
   * Accumulates a single tool call delta into the tool calls map.
   * @param {OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall} tcDelta - Tool call delta from stream
   * @param {Map<number, OpenAIToolCall>} toolCallsMap - Map of tool calls being accumulated
   */
  private accumulateToolCall(
    tcDelta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
    toolCallsMap: Map<number, OpenAIToolCall>,
  ): void {
    if (!toolCallsMap.has(tcDelta.index)) {
      toolCallsMap.set(tcDelta.index, {
        id: tcDelta.id ?? "",
        type: "function",
        function: { name: "", arguments: "" },
      });
    }

    const tc = toolCallsMap.get(tcDelta.index);

    if (tc?.type !== "function") return;

    if (tcDelta.id) tc.id = tcDelta.id;
    if (tcDelta.function?.name) tc.function.name = tcDelta.function.name;
    if (tcDelta.function?.arguments)
      tc.function.arguments += tcDelta.function.arguments;
  }

  /**
   * Builds the assistant message with tool calls and reasoning details.
   * @param {OpenAIAssistantMessageWithReasoning} currentMessage - Current message being built
   * @param {Map<number, OpenAIToolCall>} toolCallsMap - Map of accumulated tool calls
   * @param {Map<string, ReasoningDetail>} reasoningDetailsMap - Map of reasoning blocks by type-index key
   * @param {string | null} finishReason - Finish reason from the stream chunk
   * @returns {object} - Complete assistant message with all parts
   * @internal - Exported for testing only
   */
  buildStreamMessage(
    currentMessage: OpenAIAssistantMessageWithReasoning,
    toolCallsMap: Map<number, OpenAIToolCall>,
    reasoningDetailsMap: Map<string, ReasoningDetail>,
    finishReason: string | null,
  ): OpenAIAssistantMessageWithReasoning {
    const messageToAdd: OpenAIAssistantMessageWithReasoning = {
      ...currentMessage,
      // Only include tool_calls when finish_reason indicates completion
      tool_calls:
        finishReason === "tool_calls" && toolCallsMap.size > 0
          ? Array.from(toolCallsMap.values())
          : undefined,
    };

    // Convert Map to sorted array (by index) preserving full block structure
    if (reasoningDetailsMap.size > 0) {
      messageToAdd.reasoning_details = Array.from(
        reasoningDetailsMap.values(),
      ).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    }

    return messageToAdd;
  }

  /**
   * Updates chat history with a new assistant message.
   * @param {OpenAIAssistantMessageWithReasoning} message - Assistant message to add to history
   */
  private updateChatHistoryWithMessage(
    message: OpenAIAssistantMessageWithReasoning,
  ): void {
    const lastMsg = this.chatHistory.at(-1);

    if (lastMsg?.role === "assistant") {
      this.chatHistory[this.chatHistory.length - 1] =
        message as unknown as OpenAIMessage;
    } else {
      this.chatHistory.push(message as unknown as OpenAIMessage);
    }
  }

  /**
   * Extracts tool calls from the last message in chat history.
   * @returns {OpenAIToolCall[] | null} - Tool calls or null
   */
  private getToolCallsFromLastMessage(): OpenAIToolCall[] | null {
    const finalMessage = this.chatHistory.at(-1);

    return finalMessage?.role === "assistant" && finalMessage.tool_calls
      ? finalMessage.tool_calls
      : null;
  }

  /**
   * Executes all provided tool calls via MCP.
   * @param {OpenAIToolCall[]} toolCalls - Array of tool calls to execute
   * @returns {AsyncGenerator} - Generator yielding chat history updates
   */
  private async *executeToolCalls(
    toolCalls: OpenAIToolCall[],
  ): AsyncGenerator<OpenAIMessage[]> {
    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") continue;

      try {
        const result = await this.executeSingleToolCall(toolCall);
        const toolMessage: OpenAIMessage = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };

        this.chatHistory.push(toolMessage);
        yield this.chatHistory;
      } catch (error) {
        this.addErrorToolMessage(toolCall, error);
        yield this.chatHistory;
      }
    }
  }

  /**
   * Executes a single tool call and returns the result.
   * @param {OpenAIToolCall} toolCall - Tool call to execute
   * @returns {object} - Tool call result
   */
  private async executeSingleToolCall(
    toolCall: OpenAIToolCall,
  ): Promise<unknown> {
    // Type guard: ensure this is a function tool call
    if (toolCall.type !== "function") {
      throw new Error("Invalid tool call type");
    }

    const args = JSON.parse(toolCall.function.arguments || "{}");
    const result = await this.mcpClient?.callTool({
      name: toolCall.function.name,
      arguments: args,
    });

    if (!result) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }

    return result.content;
  }

  /**
   * Adds an error tool message to the chat history.
   * @param {OpenAIToolCall} toolCall - Tool call that failed
   * @param {unknown} error - Error that occurred
   */
  private addErrorToolMessage(toolCall: OpenAIToolCall, error: unknown): void {
    const toolMessage: OpenAIMessage = {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        isError: true,
      }),
    };

    this.chatHistory.push(toolMessage);
  }
}
