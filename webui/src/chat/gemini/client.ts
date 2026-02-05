// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai/web";
import type { Chat, ThinkingConfig, Tool, Part } from "@google/genai/web";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createConnectedMcpClient } from "#webui/chat/helpers/mcp-client-helpers";
import type { GeminiMessage } from "#webui/types/messages";
import { getMcpUrl } from "#webui/utils/mcp-url";
import {
  addOrMergePartToTurn,
  executeToolCalls,
  hasUnexecutedFunctionCalls,
} from "./client-helpers";
import {
  applyGeminiOverrides,
  type GeminiMessageOverrides,
} from "./message-overrides";

// Re-export for external consumers
export type { GeminiMessageOverrides } from "./message-overrides";

/** Configuration for GeminiClient */
export interface GeminiClientConfig {
  mcpUrl?: string;
  model?: string;
  temperature?: number;
  systemInstruction?: string;
  thinkingConfig?: ThinkingConfig;
  chatHistory?: GeminiMessage[];
  enabledTools?: Record<string, boolean>;
}

/**
 * Client for interacting with Gemini API with MCP tool support.
 * For UI-friendly format, use formatGeminiMessages() from gemini-formatter.js
 */
export class GeminiClient {
  ai: GoogleGenAI;
  mcpUrl: string;
  config: GeminiClientConfig;
  chat: Chat | null;
  mcpClient: Client | null;
  chatHistory: GeminiMessage[];
  chatConfig: Record<string, unknown> | null;
  hadFunctionCallsInLastTurn: boolean;
  private effectiveThinkingConfig: ThinkingConfig | undefined;
  private effectiveTemperature: number | undefined;

  constructor(apiKey: string, config: GeminiClientConfig = {}) {
    this.ai = new GoogleGenAI({ apiKey });
    this.mcpUrl = config.mcpUrl ?? getMcpUrl();
    this.config = config;
    this.chat = null;
    this.mcpClient = null;
    this.chatHistory = config.chatHistory ?? [];
    this.chatConfig = null;
    this.hadFunctionCallsInLastTurn = false;
    this.effectiveThinkingConfig = config.thinkingConfig;
    this.effectiveTemperature = config.temperature;
  }

  /**
   * Initializes the MCP connection and creates a Gemini chat session.
   */
  async initialize(): Promise<void> {
    this.mcpClient = await createConnectedMcpClient(this.mcpUrl);

    const toolsResult = await this.mcpClient.listTools();
    const enabledTools = this.config.enabledTools;
    const filteredTools = enabledTools
      ? toolsResult.tools.filter((tool) => enabledTools[tool.name] !== false)
      : toolsResult.tools;

    const tools: Tool[] =
      filteredTools.length > 0
        ? [
            {
              functionDeclarations: filteredTools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.inputSchema,
              })),
            },
          ]
        : [];

    const enabledToolNames =
      filteredTools.length > 0
        ? filteredTools.map((tool) => tool.name)
        : undefined;

    this.chatConfig = {
      ...(tools.length > 0 ? { tools } : {}),
      ...(enabledToolNames && enabledToolNames.length > 0
        ? {
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.VALIDATED,
                allowedFunctionNames: enabledToolNames,
              },
            },
          }
        : {}),
      ...this.config,
    };

    this.chat = this.ai.chats.create({
      model: this.config.model ?? "gemini-2.5-flash-lite",
      config: this.chatConfig,
      history: this.chatHistory,
    });
  }

  /**
   * Sends a message to Gemini and streams back the chat history as it updates.
   * @param {string} message - User message to send
   * @param {AbortSignal} [abortSignal] - Optional abort signal
   * @param {GeminiMessageOverrides} [overrides] - Optional per-message overrides
   * @yields Complete chat history in Gemini's raw format after each update
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    overrides?: GeminiMessageOverrides,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    this.validateInitialized();

    if (overrides) {
      this.applyOverrides(overrides);
    }

    const userMessage: GeminiMessage = {
      role: "user",
      parts: [{ text: message }],
    };

    this.chatHistory.push(userMessage);
    yield this.chatHistory;

    let continueLoop = true;
    const maxIterations = 10;
    let iteration = 0;
    let isFirstMessage = true;

    while (continueLoop && iteration < maxIterations) {
      iteration++;
      yield* this.processMessageTurn(message, isFirstMessage);
      continueLoop = await this.shouldContinueLoop(abortSignal);
      isFirstMessage = false;
    }

    this.warnIfMaxIterationsReached(iteration, maxIterations);
  }

  private applyOverrides(overrides: GeminiMessageOverrides): void {
    const { temperature, thinkingConfig } = applyGeminiOverrides(
      overrides,
      this.config,
    );

    this.effectiveTemperature = temperature;
    this.effectiveThinkingConfig = thinkingConfig;

    if (this.chatConfig) {
      this.updateChatConfig();
      this.recreateChatWithHistory();
    }
  }

  private updateChatConfig(): void {
    if (!this.chatConfig) return;

    if (this.effectiveTemperature !== undefined) {
      this.chatConfig.temperature = this.effectiveTemperature;
    }

    if (this.effectiveThinkingConfig) {
      this.chatConfig.thinkingConfig = this.effectiveThinkingConfig;
    } else {
      delete this.chatConfig.thinkingConfig;
    }
  }

  private validateInitialized(): void {
    if (!this.chat || !this.mcpClient) {
      throw new Error("Chat not initialized. Call initialize() first.");
    }
  }

  private async *processMessageTurn(
    message: string,
    isFirstMessage: boolean,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    if (!this.chat) return;

    const stream = await this.chat.sendMessageStream({
      message: isFirstMessage ? message : "",
    });

    yield* this.processStreamChunks(stream);
    yield* this.executePendingToolCalls();
  }

  private async *processStreamChunks(
    stream: AsyncIterable<unknown>,
  ): AsyncGenerator<GeminiMessage[], void, unknown> {
    let currentTurn: GeminiMessage | null = null;

    for await (const chunk of stream) {
      const chunkAny = chunk as {
        candidates?: { content?: { role?: string; parts?: Part[] } }[];
      };
      const response = chunkAny.candidates?.[0];

      if (!response?.content) continue;
      const content = response.content;
      const role = content.role;
      const parts = content.parts ?? [];

      if (!role) continue;

      for (const part of parts) {
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- optional chain would change semantics: need falsy check, not nullish
        if (!currentTurn || currentTurn.role !== role) {
          currentTurn = { role, parts: [] } as GeminiMessage;
          this.chatHistory.push(currentTurn);
        }

        currentTurn.parts ??= [];
        addOrMergePartToTurn(currentTurn, part);
        yield this.chatHistory;
      }
    }
  }

  private async *executePendingToolCalls(): AsyncGenerator<
    GeminiMessage[],
    void,
    unknown
  > {
    const lastMessage = this.chatHistory.at(-1);
    const hasFunctionCalls = hasUnexecutedFunctionCalls(lastMessage);

    this.hadFunctionCallsInLastTurn = hasFunctionCalls;

    if (!hasFunctionCalls) {
      return;
    }

    const functionResponseParts = await executeToolCalls(
      lastMessage,
      this.mcpClient,
    );

    const functionResponseMessage: GeminiMessage = {
      role: "user",
      parts: functionResponseParts as Part[],
    };

    this.chatHistory.push(functionResponseMessage);
    yield this.chatHistory;

    this.recreateChatWithHistory();
  }

  private async shouldContinueLoop(
    abortSignal?: AbortSignal,
  ): Promise<boolean> {
    if (abortSignal?.aborted) {
      return false;
    }

    return this.hadFunctionCallsInLastTurn;
  }

  private warnIfMaxIterationsReached(
    iteration: number,
    maxIterations: number,
  ): void {
    if (iteration >= maxIterations) {
      console.warn(
        "Gemini tool calling loop reached max iterations:",
        maxIterations,
      );
    }
  }

  private recreateChatWithHistory(): void {
    if (this.chatConfig) {
      this.chat = this.ai.chats.create({
        model: this.config.model ?? "gemini-2.5-flash-lite",
        config: this.chatConfig,
        history: this.chatHistory,
      });
    }
  }
}
