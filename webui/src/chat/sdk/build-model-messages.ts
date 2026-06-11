// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ReasoningPart } from "@ai-sdk/provider-utils";
import {
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
} from "ai";
import { type ChatMessage } from "./types";

/**
 * Placeholder result for a tool call the user stopped before it returned.
 * Used both to keep the model conversation valid (every tool-call needs a
 * matching tool-result or providers 400) and to render a sensible UI state.
 */
const CANCELED_TOOL_RESULT_TEXT =
  "Canceled by the user before this tool finished.";

/**
 * Convert chat history to AI SDK ModelMessage format.
 * Assistant messages with tool calls produce two ModelMessages:
 * 1. assistant message with text + tool-call parts
 * 2. tool message with tool-result parts
 *
 * Compaction keeps the prior turns in `history` for display but inserts a
 * synthetic summary marker (`isCompactionSummary`). The model only needs the
 * most recent summary plus everything after it, so we start the payload at the
 * last summary marker — earlier turns are dropped from the model view only,
 * while the UI still renders them above the divider.
 *
 * Consecutive user turns are merged into one. A compaction summary is a
 * synthetic user message, so the next real user message would otherwise sit
 * directly after it — Gemini and Mistral reject two user turns in a row (only
 * Anthropic/OpenAI tolerate it). Folding them into a single user turn keeps the
 * wire format valid for every provider while the UI still renders them
 * separately (the divider plus the user bubble).
 * @param history - Chat history to convert
 * @param includeReasoning - When true, re-emit captured signed reasoning blocks
 *   on assistant messages (only valid when the request enables thinking — see
 *   isAnthropicThinkingEnabled). Keeps the Anthropic cache prefix byte-stable
 *   across turns. Defaults to false so non-thinking requests are unchanged.
 * @returns Array of ModelMessage for streamText
 */
export function buildModelMessages(
  history: ChatMessage[],
  includeReasoning = false,
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  // Start from the most recent compaction summary; everything before it is
  // display-only history that the model should not see.
  let lastSummaryIndex = -1;

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.isCompactionSummary) {
      lastSummaryIndex = i;
      break;
    }
  }

  const modelHistory =
    lastSummaryIndex > 0 ? history.slice(lastSummaryIndex) : history;

  for (const msg of modelHistory) {
    if (msg.role === "user") {
      const last = messages.at(-1);

      if (last?.role === "user" && typeof last.content === "string") {
        last.content = `${last.content}\n\n${msg.content}`;
      } else {
        messages.push({ role: "user", content: msg.content });
      }

      continue;
    }

    // Persisted UI error messages are not part of the model conversation
    if (msg.isError) continue;

    const emitReasoning =
      includeReasoning &&
      (msg.reasoningParts ?? []).some(
        (p) => p.signature != null || p.redactedData != null,
      );

    if (!msg.toolCalls || msg.toolCalls.length === 0) {
      // Plain string unless we need to carry reasoning blocks (which require the
      // structured content form).
      messages.push({
        role: "assistant",
        content: emitReasoning ? buildAssistantContent(msg, true) : msg.content,
      });
      continue;
    }

    // Assistant message with tool calls
    messages.push({
      role: "assistant",
      content: buildAssistantContent(msg, emitReasoning),
    });

    // Tool message pairing EVERY tool-call with a result (required by providers
    // for multi-turn). buildToolResultContent backfills a canceled result for
    // any call the user stopped before it returned, so a persisted "stopped
    // mid-tool" history can still be sent without a provider 400. (This runs
    // before the stream's reconcile, so it must not assume a complete history.)
    messages.push({
      role: "tool",
      content: buildToolResultContent(msg),
    });
  }

  return messages;
}

/**
 * Backfill a "canceled" tool-result for any tool-call in the streamed assistant
 * messages that never received one — i.e. the user pressed Stop while a tool was
 * still running. Without this, the dangling tool-call (a) makes the next request
 * fail with a provider 400 (unmatched tool_use) and (b) leaves the tool rendered
 * as perpetually running in the UI. A no-op when every call already has a result.
 * @param history - The full chat history (mutated in place)
 * @param fromIndex - Index of the first message added by the current stream
 */
export function reconcileDanglingToolCalls(
  history: ChatMessage[],
  fromIndex: number,
): void {
  for (let i = fromIndex; i < history.length; i++) {
    const msg = history[i] as ChatMessage;

    if (msg.role !== "assistant" || !msg.toolCalls?.length) continue;

    const resultIds = new Set((msg.toolResults ?? []).map((tr) => tr.id));

    for (const tc of msg.toolCalls) {
      if (resultIds.has(tc.id)) continue;

      msg.toolResults ??= [];
      msg.toolResults.push({
        id: tc.id,
        name: tc.name,
        args: tc.args,
        result: CANCELED_TOOL_RESULT_TEXT,
        isError: false,
      });
    }
  }
}

/**
 * Build tool result content for the tool role message, one part per tool-call
 * (not per recorded result). A call with a recorded result emits it; a call the
 * user stopped before it returned emits a synthetic "canceled" result. This
 * guarantees no assistant tool-call is left without a matching tool-result,
 * which Anthropic/OpenAI reject with a 400.
 * @param msg - Assistant message with tool calls
 * @returns Array of ToolResultPart, one per tool-call, in tool-call order
 */
function buildToolResultContent(msg: ChatMessage): ToolResultPart[] {
  const resultsById = new Map(
    (msg.toolResults ?? []).map((tr) => [tr.id, tr] as const),
  );

  return (msg.toolCalls ?? []).map((tc) => {
    const tr = resultsById.get(tc.id);
    const value =
      tr == null
        ? CANCELED_TOOL_RESULT_TEXT
        : typeof tr.result === "string"
          ? tr.result
          : JSON.stringify(tr.result);

    return {
      type: "tool-result" as const,
      toolCallId: tc.id,
      toolName: tc.name,
      output: { type: "text" as const, value },
    };
  });
}

/**
 * Build typed AI SDK content parts for an assistant message. Reasoning blocks
 * (when requested) come first — Anthropic renders the thinking block ahead of
 * text/tool_use, and re-sending the signed block verbatim is what keeps the
 * request prefix byte-stable across turns for prompt caching.
 * @param msg - Assistant message
 * @param includeReasoning - Whether to prepend captured signed reasoning blocks
 * @returns Structured content array
 */
function buildAssistantContent(
  msg: ChatMessage,
  includeReasoning: boolean,
): Array<ReasoningPart | TextPart | ToolCallPart> {
  const parts: Array<ReasoningPart | TextPart | ToolCallPart> = [];

  if (includeReasoning) {
    for (const rp of msg.reasoningParts ?? []) {
      if (rp.signature != null) {
        parts.push({
          type: "reasoning",
          text: rp.text,
          providerOptions: { anthropic: { signature: rp.signature } },
        });
      } else if (rp.redactedData != null) {
        parts.push({
          type: "reasoning",
          text: "",
          providerOptions: { anthropic: { redactedData: rp.redactedData } },
        });
      }
    }
  }

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
