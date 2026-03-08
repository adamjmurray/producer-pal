// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI stream processor for AI SDK streamText() results.
 * Processes fullStream events and prints to terminal with formatting.
 */

import { type streamText } from "ai";
import { isQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import {
  continueThought,
  endThought,
  formatToolCall,
  formatToolResult,
  startThought,
} from "./shared/formatting.ts";
import { type TurnResult } from "./shared/types.ts";

/** Mutable state tracked during stream processing */
interface StreamState {
  text: string;
  inThought: boolean;
  toolCalls: TurnResult["toolCalls"];
}

/**
 * Process a streamText fullStream and print events to the terminal.
 * Returns a TurnResult with the collected text and tool calls for assertions.
 *
 * @param result - The streamText result to process
 * @returns TurnResult with text and tool calls
 */
export async function processCliStream(
  result: ReturnType<typeof streamText>,
): Promise<TurnResult> {
  const state: StreamState = { text: "", inThought: false, toolCalls: [] };

  for await (const part of result.fullStream) {
    handleStreamPart(part, state);
  }

  finishStream(state);

  return { text: state.text, toolCalls: state.toolCalls };
}

/**
 * Handle a single stream part, updating state and printing to terminal
 *
 * @param part - Stream part from fullStream
 * @param part.type - Stream part type identifier
 * @param state - Mutable stream state
 */
function handleStreamPart(
  part: { type: string; [key: string]: unknown },
  state: StreamState,
): void {
  switch (part.type) {
    case "text-delta":
      handleTextDelta(part.text as string, state);
      break;
    case "reasoning-delta":
      handleReasoningDelta(part.text as string, state);
      break;
    case "tool-call":
      handleToolCall(
        part.toolName as string,
        part.input as Record<string, unknown>,
        state,
      );
      break;
    case "tool-result":
      handleToolResult(part.toolName as string, part.output, state);
      break;
    case "start-step":
      handleStartStep(state);
      break;
  }
}

/**
 * Handle text-delta stream event
 *
 * @param text - Text delta content
 * @param state - Mutable stream state
 */
function handleTextDelta(text: string, state: StreamState): void {
  // Close thought block before printing text content
  if (state.inThought) {
    if (!isQuietMode()) process.stdout.write(endThought());
    state.inThought = false;
  }

  state.text += text;

  if (!isQuietMode()) process.stdout.write(text);
}

/**
 * Handle reasoning-delta stream event
 *
 * @param text - Reasoning text delta
 * @param state - Mutable stream state
 */
function handleReasoningDelta(text: string, state: StreamState): void {
  if (isQuietMode()) return;

  process.stdout.write(
    state.inThought ? continueThought(text) : startThought(text),
  );
  state.inThought = true;
}

/**
 * Handle tool-call stream event
 *
 * @param toolName - Name of the tool called
 * @param input - Tool input arguments
 * @param state - Mutable stream state
 */
function handleToolCall(
  toolName: string,
  input: Record<string, unknown>,
  state: StreamState,
): void {
  state.toolCalls.push({ name: toolName, args: input });

  if (!isQuietMode()) {
    process.stdout.write(formatToolCall(toolName, input) + "\n");
  }
}

/**
 * Handle tool-result stream event
 *
 * @param toolName - Name of the tool that produced the result
 * @param output - Tool output
 * @param state - Mutable stream state
 */
function handleToolResult(
  toolName: string,
  output: unknown,
  state: StreamState,
): void {
  attachToolResult(state.toolCalls, toolName, output);

  if (!isQuietMode()) {
    process.stdout.write(formatToolResult(formatOutput(output)));
  }
}

/**
 * Handle start-step stream event (end any open thought block)
 *
 * @param state - Mutable stream state
 */
function handleStartStep(state: StreamState): void {
  if (!state.inThought) return;

  if (!isQuietMode()) process.stdout.write(endThought());
  state.inThought = false;
}

/**
 * Finish stream processing (close thought block, add newline)
 *
 * @param state - Stream state
 */
function finishStream(state: StreamState): void {
  if (isQuietMode()) return;

  if (state.inThought) process.stdout.write(endThought());
  process.stdout.write("\n");
}

/**
 * Attach a tool result to the matching tool call
 *
 * @param toolCalls - Array of tool calls to search
 * @param toolName - Name of the tool that produced the result
 * @param output - Tool output to attach
 */
function attachToolResult(
  toolCalls: TurnResult["toolCalls"],
  toolName: string,
  output: unknown,
): void {
  // Find the last tool call with this name that doesn't have a result yet
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const tc = toolCalls[i] as TurnResult["toolCalls"][number];

    if (tc.name === toolName && tc.result == null) {
      tc.result = formatOutput(output);

      return;
    }
  }
}

/**
 * Format tool output for display and storage
 *
 * @param output - Raw tool output (may be MCP content array or other)
 * @returns Formatted string
 */
function formatOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output == null) return "";

  // MCP content array format: [{ type: "text", text: "..." }]
  if (Array.isArray(output)) {
    const first = output[0] as { text?: string } | undefined;

    if (first?.text) return first.text;
  }

  return JSON.stringify(output);
}
