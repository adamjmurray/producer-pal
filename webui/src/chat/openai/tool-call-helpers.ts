// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type OpenAI from "openai";
import { type OpenAIToolCall } from "#webui/types/messages";

/**
 * Accumulates a single tool call delta into the tool calls map.
 * Handles both standard OpenAI streaming (different indices per tool call)
 * and Ollama streaming (same index, different IDs per tool call).
 * @param tcDelta - Tool call delta from stream
 * @param toolCallsMap - Map of tool calls being accumulated
 */
export function accumulateToolCall(
  tcDelta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
  toolCallsMap: Map<number, OpenAIToolCall>,
): void {
  const mapKey = resolveToolCallMapKey(tcDelta, toolCallsMap);

  if (!toolCallsMap.has(mapKey)) {
    toolCallsMap.set(mapKey, {
      id: tcDelta.id ?? "",
      type: "function",
      function: { name: "", arguments: "" },
    });
  }

  const tc = toolCallsMap.get(mapKey);

  if (tc?.type !== "function") return;

  if (tcDelta.id) tc.id = tcDelta.id;
  if (tcDelta.function?.name) tc.function.name = tcDelta.function.name;
  if (tcDelta.function?.arguments)
    tc.function.arguments += tcDelta.function.arguments;
}

/**
 * Validates tool call arguments are valid JSON.
 * If invalid, replaces with "{}" and logs a warning.
 * Prevents malformed arguments from corrupting conversation history.
 * @param toolCalls - Array of tool calls to validate
 * @returns Sanitized tool calls array
 */
export function sanitizeToolCallArguments(
  toolCalls: OpenAIToolCall[],
): OpenAIToolCall[] {
  return toolCalls.map((tc) => {
    if (tc.type !== "function") return tc;

    try {
      JSON.parse(tc.function.arguments || "{}");

      return tc;
    } catch {
      console.warn(
        `Sanitized malformed arguments for tool "${tc.function.name}":`,
        tc.function.arguments,
      );

      return {
        ...tc,
        function: { ...tc.function, arguments: "{}" },
      };
    }
  });
}

/**
 * Resolves the Map key for a tool call delta.
 * Ollama sends parallel tool calls at the same index but different IDs.
 * Standard OpenAI uses different indices. This detects the Ollama pattern
 * and assigns a new key to avoid merging distinct tool calls.
 * @param tcDelta - Tool call delta from stream
 * @param toolCallsMap - Map of tool calls being accumulated
 * @returns Map key to use for this delta
 */
function resolveToolCallMapKey(
  tcDelta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall,
  toolCallsMap: Map<number, OpenAIToolCall>,
): number {
  const existing = toolCallsMap.get(tcDelta.index);

  if (existing && tcDelta.id && existing.id && tcDelta.id !== existing.id) {
    return toolCallsMap.size;
  }

  return tcDelta.index;
}
