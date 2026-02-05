// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Streaming helpers for OpenRouter Responses API
 */

import {
  handleReasoningText,
  handleContentText,
} from "../shared/api/responses-streaming.ts";
import { debugLog, DEBUG_SEPARATOR } from "../shared/formatting.ts";
import type {
  ChatOptions,
  ResponsesStreamEvent,
  ResponsesStreamState,
} from "../shared/types.ts";

/**
 * Reads and parses an SSE stream from the Responses API
 *
 * @param reader - Stream reader for response body
 * @param options - Chat options for debug logging
 * @param state - Stream state to update
 */
export async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: ChatOptions,
  state: ResponsesStreamState,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);

      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data) as ResponsesStreamEvent;

        if (options.debug) {
          console.log(DEBUG_SEPARATOR);
          debugLog(event);
        }

        processResponsesStreamEvent(event, state);
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

/**
 * Processes a single stream event and updates state
 *
 * @param event - Stream event to process
 * @param state - Stream state to update
 */
export function processResponsesStreamEvent(
  event: ResponsesStreamEvent,
  state: ResponsesStreamState,
): void {
  if (event.type === "response.reasoning.delta" && event.delta?.text) {
    handleReasoningText(state, event.delta.text);
  }

  if (event.type === "response.output_text.delta" && event.delta?.text) {
    handleContentText(state, event.delta.text);
  }

  if (event.type === "response.function_call_arguments.delta") {
    const callId = event.call_id ?? "";
    const existing = state.functionCalls.get(callId);

    if (existing) {
      existing.arguments += event.arguments ?? "";
    } else {
      state.functionCalls.set(callId, {
        name: event.name ?? "",
        arguments: event.arguments ?? "",
      });
    }
  }
}
