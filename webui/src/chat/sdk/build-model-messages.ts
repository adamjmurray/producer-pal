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
export const CANCELED_TOOL_RESULT_TEXT =
  "Canceled by the user before this tool finished.";

/**
 * Placeholder for the other way a tool-call is left without a result: the
 * stream failed under it (a rate limit, a dropped connection). Same job as
 * CANCELED_TOOL_RESULT_TEXT, different truth — nobody canceled anything, and
 * the tool may or may not have run before the stream died.
 */
export const FAILED_TOOL_RESULT_TEXT =
  "The request failed before this tool finished; it may or may not have run.";

/** Why a tool-call was left without a result. */
export type DanglingToolReason = "canceled" | "failed";

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

    appendAssistantMessages(messages, msg, includeReasoning);
  }

  return messages;
}

/**
 * Append the ModelMessage(s) for one assistant turn. A turn with tool calls
 * produces an assistant message plus a paired tool message; a plain turn
 * produces a single assistant message (or nothing, for a degenerate empty turn).
 * @param messages - The output array to append to
 * @param msg - The assistant chat message to convert
 * @param includeReasoning - Whether re-emitting captured reasoning blocks is allowed
 */
function appendAssistantMessages(
  messages: ModelMessage[],
  msg: ChatMessage,
  includeReasoning: boolean,
): void {
  // All-or-nothing: only re-emit reasoning when EVERY captured part is signed
  // or redacted. A message that mixes signed and unsigned parts (e.g. reasoning
  // carried over from a different provider, or a partial capture) would
  // otherwise emit just the signed subset — a partial thinking sequence whose
  // signature no longer matches its (truncated) content, which Anthropic
  // rejects. Falling back to plain content sends a valid non-thinking turn.
  const reasoningParts = msg.reasoningParts ?? [];
  const emitReasoning =
    includeReasoning &&
    reasoningParts.length > 0 &&
    reasoningParts.every((p) => p.signature != null || p.redactedData != null);

  if (!msg.toolCalls || msg.toolCalls.length === 0) {
    // Plain string unless we need to carry reasoning blocks (which require the
    // structured content form).
    const content = emitReasoning
      ? buildAssistantContent(msg, true)
      : msg.content;

    // A redacted-reasoning-only turn has no text and no tool calls, so it
    // yields empty content when reasoning isn't re-emitted (thinking off).
    // Providers reject an empty assistant message, so drop it from the model
    // view — the UI still renders the turn from history. (.length covers both
    // the string and structured-array forms.)
    if (content.length === 0) return;

    messages.push({ role: "assistant", content });

    return;
  }

  // Assistant message with tool calls
  messages.push({
    role: "assistant",
    content: buildAssistantContent(msg, emitReasoning),
  });

  // Tool message pairing EVERY tool-call with a result (required by providers
  // for multi-turn). buildToolResultContent backfills a placeholder for any call
  // still missing one, so a history persisted mid-tool can be sent without a
  // provider 400. (This runs before the stream's reconcile, so it must not
  // assume a complete history.)
  messages.push({
    role: "tool",
    content: buildToolResultContent(msg),
  });
}

/**
 * Whether the model conversation built from `history` would END on an assistant
 * turn — the one shape that is not a valid request to resume from, because
 * Gemini and Mistral reject it (and Anthropic reads it as a prefill to continue
 * rather than a turn to answer).
 *
 * This is what a rate-limit retry consults to decide whether it must inject a
 * synthetic "continue" user turn, and it deliberately asks about the WIRE shape
 * rather than the history's last entry, because the two differ in the common
 * case. An assistant turn carrying tool calls emits an assistant message AND a
 * paired tool message, so a 429 on a later step of a tool loop ends the
 * conversation on `tool` — already the canonical "here are your results, keep
 * going" continuation point, needing nothing added. Only a text-or-reasoning
 * turn with no tool calls ends on `assistant`. A reasoning-only turn with
 * thinking off is dropped from the model view entirely, which is why the
 * `includeReasoning` the request will actually use has to be passed in.
 *
 * Reading the built messages rather than re-deriving those rules is the point:
 * the retry layers previously each guessed at this from history and drifted
 * apart.
 * @param history - Chat history the retry would resume from
 * @param includeReasoning - Same flag the retry's own buildModelMessages call
 *   will use (see isAnthropicThinkingEnabled)
 * @returns True when a resume must append a user turn to be a valid request
 */
export function endsOnAssistantTurn(
  history: ChatMessage[],
  includeReasoning = false,
): boolean {
  return (
    buildModelMessages(history, includeReasoning).at(-1)?.role === "assistant"
  );
}

/**
 * Backfill a placeholder tool-result for any tool-call in the streamed assistant
 * messages that never received one. Without this, the dangling tool-call (a)
 * makes the next request fail with a provider 400 (unmatched tool_use) and (b)
 * leaves the tool rendered as perpetually running in the UI. A no-op when every
 * call already has a result.
 *
 * The caller says WHY, because the placeholder becomes history the model reads
 * back: a resumed turn that was rate-limited must not be told the user canceled
 * a tool they never touched.
 * @param history - The full chat history (mutated in place)
 * @param fromIndex - Index of the first message added by the current stream
 * @param reason - Whether the user stopped the turn or the stream failed
 */
export function reconcileDanglingToolCalls(
  history: ChatMessage[],
  fromIndex: number,
  reason: DanglingToolReason,
): void {
  const result =
    reason === "canceled" ? CANCELED_TOOL_RESULT_TEXT : FAILED_TOOL_RESULT_TEXT;

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
        result,
        isError: false,
      });
    }
  }
}

/**
 * Build tool result content for the tool role message, one part per tool-call
 * (not per recorded result). A call with a recorded result emits it; one without
 * gets a synthetic result, so no assistant tool-call is left unmatched (which
 * Anthropic/OpenAI reject with a 400).
 *
 * The synthetic one says the request failed rather than that the user canceled,
 * because reaching here means the turn's reconcile never ran — a history saved
 * mid-tool and reloaded (autosave fires on the first tool-call part), which says
 * nothing about who ended the turn.
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
        ? FAILED_TOOL_RESULT_TEXT
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
