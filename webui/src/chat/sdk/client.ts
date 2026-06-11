// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type FinishReason, type ToolSet, stepCountIs, streamText } from "ai";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";
import { getMcpUrl } from "#webui/utils/mcp-url";
import {
  buildModelMessages,
  reconcileDanglingToolCalls,
} from "./build-model-messages";
import { summarizeHistory } from "./compaction";
import { createMcpTools } from "./mcp-tools";
import { createStreamErrorSignal } from "./stream-with-error-signal";
import { type ChatClientConfig, type ChatMessage, toTokenUsage } from "./types";

const MAX_TOOL_STEPS = 10;

/**
 * AI SDK client that wraps streamText for chat with MCP tool support.
 * Implements the ChatClient<ChatMessage> interface expected by useChat.
 */
export class ChatSdkClient {
  chatHistory: ChatMessage[];
  /**
   * True when the most recent stream stopped because it hit the tool-step
   * limit (the model still wanted to call tools). Reset on each sendMessage.
   */
  toolLimitReached = false;
  private tools: ToolSet = {};
  private config: ChatClientConfig;
  /**
   * The MCP client backing `tools`. Each tool's execute() closure calls
   * mcpClient.callTool(), so it must stay connected for this client's whole
   * lifetime and only close when the client is discarded — see dispose().
   */
  private mcpClient: Client | null = null;

  /**
   * @param _apiKey - API key (handled by the model instance in config)
   * @param config - Client configuration
   */
  constructor(_apiKey: string, config: ChatClientConfig) {
    this.config = config;
    this.chatHistory = config.chatHistory ?? [];
  }

  /**
   * Initialize MCP connection and convert tools to AI SDK format.
   */
  async initialize(): Promise<void> {
    const mcpUrl = this.config.mcpUrl ?? getMcpUrl();
    const { tools, mcpClient } = await createMcpTools(
      mcpUrl,
      this.config.enabledTools,
    );

    this.tools = tools;
    this.mcpClient = mcpClient;
  }

  /**
   * Close the underlying MCP connection. Idempotent. useChat discards a client
   * on every new/restored/cleared conversation; without this each discard
   * leaks the client's open HTTP connection (the connection-test path closes
   * its client in a finally for the same reason). Fire-and-forget: close() can
   * reject if connect() never completed, which is harmless on teardown.
   */
  dispose(): void {
    const client = this.mcpClient;

    this.mcpClient = null;
    this.tools = {};
    void client?.close().catch(() => {});
  }

  /**
   * Summarize a slice of chat history into a single compaction summary,
   * using this conversation's model with no tools.
   * @param history - Messages to compact (oldest first)
   * @returns The compaction summary text
   */
  async summarize(history: ChatMessage[]): Promise<string> {
    return await summarizeHistory(this.config.model, history);
  }

  /**
   * Send a message and stream back the evolving chat history.
   * The AI SDK handles multi-step tool calling via stopWhen.
   * @param message - User message text
   * @param abortSignal - Signal to abort the stream
   * @param overrides - Per-message overrides for thinking
   * @param shouldInterrupt - Callback checked between tool steps; returns true to stop early
   * @yields Complete chat history after each stream update
   */
  async *sendMessage(
    message: string,
    abortSignal?: AbortSignal,
    overrides?: MessageOverrides,
    shouldInterrupt?: () => boolean,
  ): AsyncGenerator<ChatMessage[], void, unknown> {
    const userMsg: ChatMessage = { role: "user", content: message };

    this.toolLimitReached = false;
    stampOverrides(userMsg, overrides);
    this.chatHistory.push(userMsg);
    yield [...this.chatHistory];

    const providerOptions =
      overrides?.thinking != null && this.config.buildProviderOptions
        ? this.config.buildProviderOptions(overrides.thinking)
        : this.config.providerOptions;

    yield* this.processStream(providerOptions, abortSignal, shouldInterrupt);
    // Final yield to ensure last step's usage (attached by onStepFinish) is emitted
    yield [...this.chatHistory];
  }

  /**
   * Call streamText, process the fullStream, and yield chat history updates.
   * Wires the AI SDK's onError callback into the stream iterator so browser
   * CORS/network errors (which hang fullStream) surface immediately.
   * @param providerOptions - Provider-specific options for streamText
   * @param abortSignal - Signal to abort the stream
   * @param shouldInterrupt - Callback checked between tool steps; returns true to stop early
   * @yields Updated chat history after each meaningful stream event
   */
  private async *processStream(
    providerOptions: Parameters<typeof streamText>[0]["providerOptions"],
    abortSignal?: AbortSignal,
    shouldInterrupt?: () => boolean,
  ): AsyncGenerator<ChatMessage[]> {
    let currentMsg: ChatMessage = { role: "assistant", content: "" };
    let addedCurrentMsg = false;

    const historyLengthBefore = this.chatHistory.length;
    let stepIndex = 0;

    const errorSignal = createStreamErrorSignal();

    const result = streamText({
      model: this.config.model,
      maxRetries: 0, // Disable SDK-level retry so app-level retry (executeWithRetry) handles 429s with UI feedback
      system: this.config.systemInstruction,
      messages: buildModelMessages(
        this.chatHistory,
        isAnthropicThinkingEnabled(providerOptions),
      ),
      tools: Object.keys(this.tools).length > 0 ? this.tools : undefined,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      temperature: this.config.temperature,
      providerOptions,
      abortSignal,
      onError: errorSignal.onError,
      onStepFinish: (event) => {
        let count = 0;

        for (let i = historyLengthBefore; i < this.chatHistory.length; i++) {
          const msg = this.chatHistory[i] as ChatMessage;

          if (msg.role === "assistant" && count++ === stepIndex) {
            msg.usage = toTokenUsage(event.usage);

            if (event.response.modelId) {
              msg.responseModel = event.response.modelId;
            }

            break;
          }
        }

        stepIndex++;
      },
    });

    const stream = errorSignal.wrapStream(result.fullStream);

    let completedSteps = 0;
    let finalFinishReason: FinishReason | undefined;

    try {
      for await (const part of stream) {
        const handled = handleStreamPart(part.type, part, currentMsg);

        if (handled) {
          if (!addedCurrentMsg) {
            this.chatHistory.push(currentMsg);
            addedCurrentMsg = true;
          }

          yield [...this.chatHistory];
        } else if (part.type === "start-step" && addedCurrentMsg) {
          // Between tool steps: check if a queued user message should interrupt
          if (shouldInterrupt?.()) return;
          // New step means new assistant turn (after tool results)
          currentMsg = { role: "assistant", content: "" };
          addedCurrentMsg = false;
        } else if (part.type === "finish-step") {
          completedSteps++;
        } else if (part.type === "finish") {
          finalFinishReason = (part as { finishReason?: FinishReason })
            .finishReason;
        }
      }
    } finally {
      // If the user pressed Stop mid-tool, the in-flight assistant message holds
      // a tool-call with no tool-result. Backfill a "canceled" result so the
      // history stays valid (providers reject an unmatched tool-call) and the UI
      // doesn't render the tool as perpetually running. No-op on clean finishes.
      reconcileDanglingToolCalls(this.chatHistory, historyLengthBefore);
    }

    this.toolLimitReached = detectToolLimitReached(
      completedSteps,
      finalFinishReason,
    );
  }
}

/**
 * Decide whether a finished stream hit the multi-step tool-call limit.
 *
 * The AI SDK's `stopWhen: stepCountIs(MAX_TOOL_STEPS)` halts the agentic loop
 * once MAX_TOOL_STEPS steps complete. If the model still wanted to call tools
 * at that point, the final finishReason is `"tool-calls"` — that combination is
 * the genuine limit hit. A clean `"stop"`, a user abort (no `finish` part, so
 * finishReason is undefined), and errors all fail this check and must NOT show
 * the notice.
 * @param completedSteps - Number of completed steps (finish-step parts seen)
 * @param finishReason - Overall finishReason from the finish part, if any
 * @returns True only when the tool-step limit was reached mid-task
 */
export function detectToolLimitReached(
  completedSteps: number,
  finishReason: FinishReason | undefined,
): boolean {
  return completedSteps >= MAX_TOOL_STEPS && finishReason === "tool-calls";
}

/**
 * Whether the request's provider options enable Anthropic thinking. Only then is
 * it valid to re-send signed reasoning blocks (the API rejects reasoning content
 * when thinking is disabled), and only then does re-sending help caching.
 * @param providerOptions - Provider options passed to streamText
 * @returns True when Anthropic thinking is enabled for this request
 */
function isAnthropicThinkingEnabled(
  providerOptions: Parameters<typeof streamText>[0]["providerOptions"],
): boolean {
  const anthropic = providerOptions?.anthropic as
    | { thinking?: unknown }
    | undefined;

  return anthropic?.thinking != null;
}

/**
 * Stamp per-message setting overrides onto a user message.
 * Only sets fields that are present in the overrides.
 * @param msg - User message to stamp
 * @param overrides - Per-message overrides (undefined = no overrides)
 */
function stampOverrides(msg: ChatMessage, overrides?: MessageOverrides): void {
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
  msg: ChatMessage,
): boolean {
  if (type === "text-delta") {
    msg.content += part.text as string;

    return true;
  }

  // Reasoning arrives as start → delta(s) → end. We keep the flattened text in
  // `reasoning` for display AND capture each block (text + signature) in
  // `reasoningParts` so the signed thinking block can be re-sent on later turns
  // (see buildAssistantContent — keeps the Anthropic cache prefix stable).
  if (type === "reasoning-start") {
    msg.reasoningParts ??= [];
    msg.reasoningParts.push({ text: "" });
    captureReasoningSignature(part, msg);

    return false;
  }

  if (type === "reasoning-delta") {
    const text = part.text as string;

    msg.reasoning = (msg.reasoning ?? "") + text;
    msg.reasoningParts ??= [];

    if (msg.reasoningParts.length === 0) msg.reasoningParts.push({ text: "" });

    const last = msg.reasoningParts.at(-1) as { text: string };

    last.text += text;
    captureReasoningSignature(part, msg);

    return true;
  }

  if (type === "reasoning-end") {
    captureReasoningSignature(part, msg);

    return false;
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
 * Capture an Anthropic reasoning block's signature (or redacted data) from a
 * stream part's provider metadata onto the message's current reasoning block.
 * @param part - Stream part (reasoning-start/delta/end)
 * @param msg - Message whose last reasoning block receives the signature
 */
function captureReasoningSignature(
  part: Record<string, unknown>,
  msg: ChatMessage,
): void {
  const providerMetadata = part.providerMetadata as
    | { anthropic?: { signature?: unknown; redactedData?: unknown } }
    | undefined;
  const meta = providerMetadata?.anthropic;
  const last = msg.reasoningParts?.at(-1);

  if (!meta || !last) return;

  if (typeof meta.signature === "string") last.signature = meta.signature;

  if (typeof meta.redactedData === "string") {
    last.redactedData = meta.redactedData;
  }
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
