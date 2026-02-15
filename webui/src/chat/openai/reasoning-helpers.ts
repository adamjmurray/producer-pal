// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type OpenAI from "openai";
import { type OpenAIToolCall } from "#webui/types/messages";

type Delta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

/**
 * Extended delta type with reasoning fields from o-series models.
 * These fields exist at runtime but aren't in official openai types yet.
 */
interface DeltaWithReasoning extends Delta {
  reasoning_content?: string;
  reasoning_details?: ReasoningDetail[];
}

/**
 * Reasoning detail structure from OpenRouter/OpenAI streaming responses.
 * Must preserve ALL fields exactly as received for API round-tripping.
 */
export interface ReasoningDetail {
  type: string; // "reasoning.text", "reasoning.summary", "reasoning.encrypted"
  text?: string;
  index?: number;
  id?: string;
  format?: string;
  // Allow additional fields for future-proofing and encrypted types
  [key: string]: unknown;
}

/**
 * Extended OpenAI assistant message type that includes reasoning fields.
 * These fields are not in the official types yet but are supported by OpenRouter and OpenAI o-series models.
 */
export interface OpenAIAssistantMessageWithReasoning {
  role: "assistant";
  content: string;
  tool_calls?: OpenAIToolCall[];
  reasoning_details?: ReasoningDetail[];
}

/**
 * Processes a streaming delta chunk to extract reasoning content.
 * Handles both OpenAI's reasoning_content field and OpenRouter's reasoning_details array.
 *
 * @param delta - The delta object from a streaming chunk
 * @returns The reasoning text from this delta, or empty string if none
 */
export function extractReasoningFromDelta(delta: Delta): string {
  const d = delta as DeltaWithReasoning;

  if (d.reasoning_content) {
    return d.reasoning_content;
  }

  if (d.reasoning_details) {
    let text = "";

    for (const detail of d.reasoning_details) {
      if (detail.type === "reasoning.text" && detail.text) {
        text += detail.text;
      }
    }

    return text;
  }

  return "";
}

/**
 * Processes reasoning delta from a stream chunk and accumulates blocks by type-index key.
 * Preserves full block structure for API round-tripping.
 * @param delta - Delta object from stream chunk
 * @param reasoningDetailsMap - Map of reasoning blocks by type-index key
 */
export function processReasoningDelta(
  delta: Delta,
  reasoningDetailsMap: Map<string, ReasoningDetail>,
): void {
  const details = (delta as DeltaWithReasoning).reasoning_details;

  if (!details) return;

  for (const detail of details) {
    const index = detail.index ?? 0;
    const key = `${detail.type}-${index}`;
    const existing = reasoningDetailsMap.get(key);

    if (existing) {
      if (detail.text) existing.text = (existing.text ?? "") + detail.text;

      // Merge NEW fields from later chunks (e.g., thought_signature, signature)
      // Also overwrite empty strings - Anthropic sends signature:"" first, real value later
      for (const field of Object.keys(detail)) {
        if (field === "text" || field === "index") continue;
        const existingVal = existing[field];
        const newVal = detail[field];

        if (existingVal === undefined || (existingVal === "" && newVal)) {
          existing[field] = newVal;
        }
      }
    } else {
      reasoningDetailsMap.set(key, { ...detail });
    }
  }
}
