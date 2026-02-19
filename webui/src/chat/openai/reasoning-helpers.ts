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
  reasoning?: string; // Ollama OpenAI-compatible format
  reasoning_content?: string; // DeepSeek format
  reasoning_details?: ReasoningDetail[]; // OpenAI/OpenRouter format
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
 * Handles Ollama's reasoning field, DeepSeek's reasoning_content, and OpenRouter's reasoning_details array.
 *
 * @param delta - The delta object from a streaming chunk
 * @returns The reasoning text from this delta, or empty string if none
 */
export function extractReasoningFromDelta(delta: Delta): string {
  const d = delta as DeltaWithReasoning;

  if (d.reasoning) {
    return d.reasoning;
  }

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
 * Accumulates a string reasoning value into the map as a synthetic reasoning.text entry.
 * Used for Ollama's `reasoning` and DeepSeek's `reasoning_content` fields.
 * @param text - Reasoning string from the delta
 * @param reasoningDetailsMap - Map of reasoning blocks by type-index key
 */
function accumulateStringReasoning(
  text: string,
  reasoningDetailsMap: Map<string, ReasoningDetail>,
): void {
  const key = "reasoning.text-0";
  const existing = reasoningDetailsMap.get(key);

  if (existing) {
    existing.text = (existing.text ?? "") + text;
  } else {
    reasoningDetailsMap.set(key, {
      type: "reasoning.text",
      text,
      index: 0,
    });
  }
}

/**
 * Merges a new reasoning detail chunk into an existing entry.
 * Accumulates text and merges new/empty fields from later chunks.
 * @param existing - Existing reasoning detail entry
 * @param detail - New detail chunk to merge
 */
function mergeReasoningDetail(
  existing: ReasoningDetail,
  detail: ReasoningDetail,
): void {
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
  const d = delta as DeltaWithReasoning;

  // Handle string-based reasoning fields (Ollama's `reasoning`, DeepSeek's `reasoning_content`)
  const reasoningString = d.reasoning ?? d.reasoning_content;

  if (reasoningString) {
    accumulateStringReasoning(reasoningString, reasoningDetailsMap);
  }

  const details = d.reasoning_details;

  if (!details) return;

  for (const detail of details) {
    const index = detail.index ?? 0;
    const key = `${detail.type}-${index}`;
    const existing = reasoningDetailsMap.get(key);

    if (existing) {
      mergeReasoningDetail(existing, detail);
    } else {
      reasoningDetailsMap.set(key, { ...detail });
    }
  }
}
