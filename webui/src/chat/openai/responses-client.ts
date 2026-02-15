// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Client for OpenAI Responses API with MCP tool support.
 * Uses the newer responses.create() API that supports Codex models.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import OpenAI from "openai";
import {
  type ResponseCreateParamsBase,
  type ResponseInput,
  type Tool,
} from "openai/resources/responses/responses";
import {
  createConnectedMcpClient,
  filterEnabledTools,
} from "#webui/chat/helpers/mcp-client-helpers";
import {
  type ReasoningSummary,
  type ResponsesConversationItem,
  type ResponsesStreamEvent,
  type ResponsesTool,
} from "#webui/types/responses-api";
import { getMcpUrl } from "#webui/utils/mcp-url";
import { createStreamState, processStreamEvent } from "./responses-streaming";

export { extractReasoningText } from "./responses-streaming";

const MCP_NOT_INITIALIZED_ERROR =
  "MCP client not initialized. Call initialize() first.";

export interface ResponsesClientConfig {
  mcpUrl?: string;
  model: string;
  temperature?: number;
  systemInstruction?: string;
  reasoningEffort?: "low" | "medium" | "high";
  reasoningSummary?: ReasoningSummary;
  conversation?: ResponsesConversationItem[];
  enabledTools?: Record<string, boolean>;
}

export interface ResponsesMessageOverrides {
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * Client for OpenAI Responses API with MCP tool support.
 * Returns conversation in Responses API format.
 * For UI-friendly format, use formatResponsesMessages() from responses-formatter.ts
 */
export class ResponsesClient {
  ai: OpenAI;
  mcpUrl: string;
  config: ResponsesClientConfig;
  mcpClient: Client | null;
  conversation: ResponsesConversationItem[];
  /** Tracks whether most recent API response included tool calls */
  private lastResponseHadToolCalls = false;

  /**
   * Alias for conversation to satisfy ChatClient interface
   * @returns The conversation history
   */
  get chatHistory(): ResponsesConversationItem[] {
    return this.conversation;
  }

  constructor(apiKey: string, config: ResponsesClientConfig) {
    this.ai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.mcpUrl = config.mcpUrl ?? getMcpUrl();
    this.config = config;
    this.mcpClient = null;
    this.conversation = config.conversation ?? [];
  }

  async initialize(): Promise<void> {
    this.mcpClient = await createConnectedMcpClient(this.mcpUrl);
  }

  /**
   * Sends a message and streams back the conversation as it updates.
   * Yields full conversation after each update, executing tool calls automatically.
   * @param message - User message to send
   * @param abortSignal - Optional abort signal to cancel the request
   * @param overrides - Optional per-message setting overrides
   * @yields Complete conversation after each update
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    overrides?: ResponsesMessageOverrides,
  ): AsyncGenerator<ResponsesConversationItem[], void, unknown> {
    if (!this.mcpClient) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }

    // Add user message
    this.conversation.push({ type: "message", role: "user", content: message });
    yield this.conversation;

    const tools = await this.getFilteredTools();
    const effectiveSettings = this.calculateEffectiveSettings(overrides);

    // Tool calling loop
    let continueLoop = true;
    const maxIterations = 10;
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;

      yield* this.processStreamAndUpdateConversation(
        tools,
        effectiveSettings,
        abortSignal,
      );

      // Continue loop if this response had tool calls and not aborted
      continueLoop = this.lastResponseHadToolCalls && !abortSignal?.aborted;
    }

    if (iteration >= maxIterations) {
      console.warn(
        "Responses API tool calling loop reached max iterations:",
        maxIterations,
      );
    }
  }

  private calculateEffectiveSettings(overrides?: ResponsesMessageOverrides): {
    temperature: number | undefined;
    reasoningEffort: "low" | "medium" | "high" | undefined;
  } {
    return {
      temperature: overrides?.temperature ?? this.config.temperature,
      reasoningEffort:
        overrides?.reasoningEffort ?? this.config.reasoningEffort,
    };
  }

  private async getFilteredTools(): Promise<ResponsesTool[]> {
    const toolsResult = await this.mcpClient?.listTools();

    if (!toolsResult) {
      throw new Error(MCP_NOT_INITIALIZED_ERROR);
    }

    const filteredTools = filterEnabledTools(
      toolsResult.tools,
      this.config.enabledTools,
    );

    // Responses API uses flat tool format
    return filteredTools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
    }));
  }

  private buildRequestBody(
    tools: ResponsesTool[],
    settings: {
      temperature: number | undefined;
      reasoningEffort: "low" | "medium" | "high" | undefined;
    },
  ): ResponseCreateParamsBase {
    const body: ResponseCreateParamsBase = {
      model: this.config.model,
      input: this.conversation as ResponseInput,
      tools: tools as Tool[],
    };

    if (settings.reasoningEffort) {
      body.reasoning = {
        effort: settings.reasoningEffort,
        summary: this.config.reasoningSummary ?? "auto",
      };
    }

    if (settings.temperature != null) {
      body.temperature = settings.temperature;
    }

    if (this.config.systemInstruction) {
      body.instructions = this.config.systemInstruction;
    }

    return body;
  }

  private async *processStreamAndUpdateConversation(
    tools: ResponsesTool[],
    settings: {
      temperature: number | undefined;
      reasoningEffort: "low" | "medium" | "high" | undefined;
    },
    abortSignal?: AbortSignal,
  ): AsyncGenerator<ResponsesConversationItem[]> {
    const requestBody = this.buildRequestBody(tools, settings);

    const stream = await this.ai.responses.create({
      ...requestBody,
      stream: true,
    });

    const state = createStreamState();
    const mcpClient = {
      callTool: async (params: {
        name: string;
        arguments: Record<string, unknown>;
      }) => {
        const result = await this.mcpClient?.callTool(params);

        if (!result) throw new Error(MCP_NOT_INITIALIZED_ERROR);

        return { content: result.content };
      },
    };

    for await (const event of stream) {
      if (abortSignal?.aborted) break;

      await processStreamEvent(
        event as ResponsesStreamEvent,
        state,
        mcpClient,
        this.conversation,
      );

      // Yield current conversation state (includes streamed content)
      yield this.conversation;
    }

    // Track whether this response had tool calls for the loop condition
    this.lastResponseHadToolCalls = state.hasToolCalls;
  }
}
