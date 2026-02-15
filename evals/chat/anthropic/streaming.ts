// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { inspect } from "node:util";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { isQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import {
  continueThought,
  DEBUG_SEPARATOR,
  debugLog,
  endThought,
  startThought,
} from "../shared/formatting.ts";
import type { TurnResult } from "../shared/types.ts";

export interface StreamResult {
  response: Message;
  text: string;
  toolCalls: TurnResult["toolCalls"];
}

interface StreamEventResult {
  inThought: boolean;
  currentToolUse: { id: string; name: string; inputJson: string } | null;
  text?: string;
  toolCall?: TurnResult["toolCalls"][number];
}

/**
 * Handles streaming response from Anthropic
 *
 * @param client - Anthropic client instance
 * @param requestBody - Request parameters for messages.create
 * @param debug - Whether to log debug information
 * @returns Stream result with response, text, and tool calls
 */
export async function handleStreamingResponse(
  client: Anthropic,
  requestBody: Anthropic.MessageCreateParams,
  debug: boolean,
): Promise<StreamResult> {
  const stream = client.messages.stream(requestBody);

  let inThought = false;
  let text = "";
  const toolCalls: TurnResult["toolCalls"] = [];
  let currentToolUse: { id: string; name: string; inputJson: string } | null =
    null;

  for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
    if (debug) {
      console.log(DEBUG_SEPARATOR);
      console.log("Stream event:", event.type);
      debugLog(event);
    }

    const result = processStreamEvent(event, inThought, currentToolUse);

    inThought = result.inThought;
    currentToolUse = result.currentToolUse;

    if (result.text) text += result.text;
    if (result.toolCall) toolCalls.push(result.toolCall);
  }

  if (!isQuietMode()) console.log();
  const response = await stream.finalMessage();

  return { response, text, toolCalls };
}

/**
 * Processes a single streaming event and returns updated state
 *
 * @param event - Raw message stream event
 * @param inThought - Whether currently in a thinking block
 * @param currentToolUse - Current tool use being accumulated
 * @returns Updated state with any text or tool call
 */
function processStreamEvent(
  event: RawMessageStreamEvent,
  inThought: boolean,
  currentToolUse: { id: string; name: string; inputJson: string } | null,
): StreamEventResult {
  if (event.type === "content_block_start") {
    return handleContentBlockStart(event, inThought);
  }

  if (event.type === "content_block_delta") {
    return handleContentBlockDelta(event, inThought, currentToolUse);
  }

  if (event.type === "content_block_stop") {
    return handleContentBlockStop(inThought, currentToolUse);
  }

  return { inThought, currentToolUse };
}

/**
 * Handles content_block_start streaming event
 *
 * @param event - Content block start event
 * @param inThought - Whether currently in a thinking block
 * @returns Updated state
 */
function handleContentBlockStart(
  event: RawContentBlockStartEvent,
  inThought: boolean,
): StreamEventResult {
  const block = event.content_block;

  if (block.type === "thinking") {
    if (!isQuietMode()) process.stdout.write(startThought(""));

    return { inThought: true, currentToolUse: null };
  }

  if (block.type === "tool_use") {
    return {
      inThought,
      currentToolUse: { id: block.id, name: block.name, inputJson: "" },
    };
  }

  return { inThought, currentToolUse: null };
}

/**
 * Handles content_block_delta streaming event
 *
 * @param event - Content block delta event
 * @param inThought - Whether currently in a thinking block
 * @param currentToolUse - Current tool use being accumulated
 * @returns Updated state with any text
 */
function handleContentBlockDelta(
  event: RawContentBlockDeltaEvent,
  inThought: boolean,
  currentToolUse: { id: string; name: string; inputJson: string } | null,
): StreamEventResult {
  const delta = event.delta;

  if (delta.type === "thinking_delta") {
    if (!isQuietMode()) process.stdout.write(continueThought(delta.thinking));

    return { inThought: true, currentToolUse };
  }

  if (delta.type === "text_delta") {
    if (!isQuietMode()) {
      if (inThought) {
        process.stdout.write(endThought());
      }

      process.stdout.write(delta.text);
    }

    return { inThought: false, currentToolUse, text: delta.text };
  }

  if (delta.type === "input_json_delta" && currentToolUse) {
    return {
      inThought,
      currentToolUse: {
        ...currentToolUse,
        inputJson: currentToolUse.inputJson + delta.partial_json,
      },
    };
  }

  return { inThought, currentToolUse };
}

/**
 * Handles content_block_stop streaming event
 *
 * @param inThought - Whether currently in a thinking block
 * @param currentToolUse - Current tool use to finalize
 * @returns Updated state with any tool call
 */
function handleContentBlockStop(
  inThought: boolean,
  currentToolUse: { id: string; name: string; inputJson: string } | null,
): StreamEventResult {
  if (inThought && !isQuietMode()) {
    process.stdout.write(endThought());
  }

  if (currentToolUse) {
    const args = JSON.parse(currentToolUse.inputJson || "{}") as Record<
      string,
      unknown
    >;

    if (!isQuietMode()) {
      process.stdout.write(
        `\ud83d\udd27 ${currentToolUse.name}(${inspect(args, { compact: true, depth: 10 })})\n`,
      );
    }

    return {
      inThought: false,
      currentToolUse: null,
      toolCall: { name: currentToolUse.name, args },
    };
  }

  return { inThought: false, currentToolUse: null };
}

/**
 * Formats a non-streaming response for display
 *
 * @param response - Anthropic message response
 * @returns Formatted text and tool calls
 */
export function formatNonStreamingResponse(response: Message): {
  text: string;
  toolCalls: TurnResult["toolCalls"];
} {
  const output: string[] = [];
  const toolCalls: TurnResult["toolCalls"] = [];

  for (const block of response.content) {
    const result = formatContentBlock(block);

    if (result.output) output.push(result.output);
    if (result.toolCall) toolCalls.push(result.toolCall);
  }

  return { text: output.join("\n"), toolCalls };
}

/**
 * Formats a single content block for display
 *
 * @param block - Content block to format
 * @returns Formatted output and any tool call
 */
function formatContentBlock(block: ContentBlock): {
  output?: string;
  toolCall?: TurnResult["toolCalls"][number];
} {
  if (block.type === "text") {
    return { output: block.text };
  }

  if (block.type === "thinking") {
    return { output: `${startThought(block.thinking)}${endThought()}` };
  }

  if (block.type === "tool_use") {
    const args = block.input as Record<string, unknown>;

    return {
      output: `\ud83d\udd27 ${block.name}(${inspect(args, { compact: true, depth: 10 })})`,
      toolCall: { name: block.name, args },
    };
  }

  return {};
}
