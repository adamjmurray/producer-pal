// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Mapping from AI SDK stream parts onto the assistant message being built.
 *
 * Split out of the client because it is pure part-to-message translation with no
 * client state involved: text and reasoning deltas, tool calls, and tool results
 * accumulating onto one ChatMessage.
 */

import { type ChatMessage } from "#webui/chat/sdk/types";

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
