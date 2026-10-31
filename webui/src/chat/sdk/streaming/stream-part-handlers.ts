// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Mapping from AI SDK stream parts onto the assistant message being built.
 *
 * Split out of the client because it is pure part-to-message translation with no
 * client state involved: text and reasoning deltas, tool calls, and tool results
 * accumulating onto one ChatMessage.
 */

import { CLAUDE_REASONING_FORMAT } from "#webui/chat/sdk/provider/openrouter-reasoning";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { errorMessage } from "#src/shared/error-message";
import { captureThoughtSignature } from "./gemini-thought-signatures";

/**
 * Handle a single stream part, updating the current message.
 * @param type - Stream part type
 * @param part - The full stream part object
 * @param msg - Current assistant message to update
 * @returns True if content was added (should yield)
 */
export function handleStreamPart(
  type: string,
  part: Record<string, unknown>,
  msg: ChatMessage,
): boolean {
  const added = applyStreamPart(type, part, msg);

  // After applying, so the thought summary or tool call it signs exists.
  captureThoughtSignature(type, part, msg);

  return added;
}

/**
 * Apply one stream part's content to the message.
 * @param type - Stream part type
 * @param part - The full stream part object
 * @param msg - Current assistant message to update
 * @returns True if content was added (should yield)
 */
function applyStreamPart(
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

    // A fully-redacted thinking block can be a turn's ONLY content (no
    // reasoning-delta/text-delta/tool-call follows). Treat the captured
    // redactedData as content-bearing so the message is pushed to history
    // instead of being silently dropped along with its reasoning.
    return msg.reasoningParts.at(-1)?.redactedData != null;
  }

  if (type === "reasoning-delta") {
    appendReasoningDelta(part, msg);

    return true;
  }

  if (type === "reasoning-end") {
    captureReasoningSignature(part, msg);
    captureOpenRouterReasoning(part, msg, false);

    return false;
  }

  if (type === "tool-call") {
    // OpenRouter puts the step's reasoning_details on the first tool call when
    // no text follows the reasoning.
    captureOpenRouterReasoning(part, msg, true);
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
      result: errorMessage(part.error),
      isError: true,
    });

    return true;
  }

  return false;
}

/**
 * Add a reasoning delta to the message: its display text and the current block.
 * @param part - The `reasoning-delta` stream part
 * @param msg - Message that receives the text
 */
function appendReasoningDelta(
  part: Record<string, unknown>,
  msg: ChatMessage,
): void {
  const text = part.text as string;

  msg.reasoningParts ??= [];

  if (msg.reasoningParts.length === 0) {
    msg.reasoningParts.push({ text: "" });
  }

  const last = msg.reasoningParts.at(-1) as { text: string };

  // Each reasoning block (OpenAI summary part, Anthropic thinking block) is a
  // new paragraph; without a break its bold title glues onto the previous
  // sentence. An empty `last` means a block just started.
  const startsBlock =
    text !== "" && last.text === "" && (msg.reasoning ?? "") !== "";

  msg.reasoning = (msg.reasoning ?? "") + (startsBlock ? "\n\n" : "") + text;
  last.text += text;
  captureReasoningSignature(part, msg);
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

  if (!meta || !last) {
    return;
  }

  if (typeof meta.signature === "string") {
    last.signature = meta.signature;
  }

  if (typeof meta.redactedData === "string") {
    last.redactedData = meta.redactedData;
  }
}

// Messages whose details came from a tool call. The SDK prefers those over the
// reasoning block's when it builds the next request, so a later reasoning-end
// must not replace them.
const detailsFromToolCall = new WeakSet<ChatMessage>();

/**
 * Keep an OpenRouter step's `reasoning_details` on the message, but only when
 * they are Claude's and complete: every entry in Claude's format, thinking text
 * signed, redacted blocks carrying their data. Anything else would be rejected
 * (or mean nothing) when re-sent, so it is cleared and the turn goes back as
 * plain content. A non-empty list from a tool call wins over the reasoning
 * block's, as it does when the SDK sends the step back within a turn.
 * @param part - Stream part (reasoning-end or tool-call)
 * @param msg - Message that receives the details
 * @param fromToolCall - True when the part is a tool call
 */
function captureOpenRouterReasoning(
  part: Record<string, unknown>,
  msg: ChatMessage,
  fromToolCall: boolean,
): void {
  const providerMetadata = part.providerMetadata as
    | { openrouter?: { reasoning_details?: unknown } }
    | undefined;
  const details = providerMetadata?.openrouter?.reasoning_details;

  if (
    !Array.isArray(details) ||
    details.length === 0 ||
    (!fromToolCall && detailsFromToolCall.has(msg))
  ) {
    return;
  }

  if (fromToolCall) {
    detailsFromToolCall.add(msg);
  }

  msg.openrouterReasoningDetails = details.every(isClaudeReasoningDetail)
    ? (details as NonNullable<ChatMessage["openrouterReasoningDetails"]>)
    : undefined;
}

/**
 * Whether one OpenRouter reasoning detail is a complete Claude thinking block.
 * @param detail - One `reasoning_details` entry
 * @returns True for a signed thinking block or a redacted block with its data
 */
function isClaudeReasoningDetail(detail: unknown): boolean {
  const d = detail as
    | { type?: string; format?: string; signature?: unknown; data?: unknown }
    | null
    | undefined;

  if (d?.format !== CLAUDE_REASONING_FORMAT) {
    return false;
  }

  if (d.type === "reasoning.text") {
    return typeof d.signature === "string" && d.signature !== "";
  }

  return d.type === "reasoning.encrypted" && typeof d.data === "string";
}
