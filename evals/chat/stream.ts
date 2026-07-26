// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI stream processor for AI SDK streamText() results.
 * Processes stream events and prints to terminal with formatting.
 */

import { type streamText } from "ai";
import { isQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import {
  continueThought,
  describeStreamError,
  endThought,
  formatError,
  formatToolCall,
  formatToolResult,
  formatWarning,
  startThought,
} from "./shared/formatting.ts";
import { mcpResultText } from "./shared/mcp-result-text.ts";
import { type TurnResult } from "./shared/types.ts";

/** Mutable state tracked during stream processing */
interface StreamState {
  text: string;
  inThought: boolean;
  toolCalls: TurnResult["toolCalls"];
  hadToolCalls: boolean;
  showUsage: boolean;
  stepCount: number;
  /** True once any reasoning-delta arrived — distinguishes a reasoning-only
   * turn (normal thinking-model finish) from a truly empty one. */
  sawReasoning: boolean;
  error?: string;
}

/**
 * Process a streamText result stream and print events to the terminal.
 * Returns a TurnResult with the collected text and tool calls for assertions.
 *
 * @param result - The streamText result to process
 * @param options - Processing options
 * @param options.showUsage - Whether usage is shown after steps (affects spacing)
 * @returns TurnResult with text and tool calls
 */
export async function processCliStream(
  result: ReturnType<typeof streamText>,
  options?: { showUsage?: boolean },
): Promise<TurnResult> {
  const state: StreamState = {
    text: "",
    inThought: false,
    toolCalls: [],
    hadToolCalls: false,
    showUsage: options?.showUsage ?? false,
    stepCount: 0,
    sawReasoning: false,
  };

  for await (const part of result.stream) {
    handleStreamPart(part, state);
  }

  finishStream(state);

  return { text: state.text, toolCalls: state.toolCalls, error: state.error };
}

/**
 * Handle a single stream part, updating state and printing to terminal
 *
 * @param part - Stream part from the streamText result
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
        part.toolCallId as string,
        part.input as Record<string, unknown>,
        state,
      );
      break;
    case "tool-result":
      handleToolResult(
        part.toolName as string,
        part.toolCallId as string,
        part.output,
        state,
      );
      break;
    case "start-step":
      handleStartStep(state);
      break;
    case "error":
      handleError(part.error, state);
      break;
  }
}

/**
 * Handle an error stream event. The AI SDK surfaces streaming/API failures as
 * an "error" part rather than throwing, so without this they are silently
 * dropped and the turn just looks like an empty response.
 *
 * @param error - The error value from the stream part
 * @param state - Mutable stream state
 */
function handleError(error: unknown, state: StreamState): void {
  if (state.inThought) {
    process.stderr.write(endThought());
    state.inThought = false;
  }

  state.error = describeStreamError(error);

  process.stderr.write(formatError(state.error) + "\n");
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
  // Record this before the quiet-mode return so the empty-turn diagnostic can
  // tell a reasoning-only turn apart even when thoughts aren't printed.
  state.sawReasoning = true;

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
 * @param toolCallId - Unique id of this tool call (matches its later result)
 * @param input - Tool input arguments
 * @param state - Mutable stream state
 */
function handleToolCall(
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>,
  state: StreamState,
): void {
  state.toolCalls.push({ name: toolName, args: input, toolCallId });
  state.hadToolCalls = true;

  if (!isQuietMode()) {
    process.stdout.write(formatToolCall(toolName, input) + "\n");
  }
}

/**
 * Handle tool-result stream event
 *
 * @param toolName - Name of the tool that produced the result
 * @param toolCallId - Id of the tool call this result belongs to
 * @param output - Tool output
 * @param state - Mutable stream state
 */
function handleToolResult(
  toolName: string,
  toolCallId: string,
  output: unknown,
  state: StreamState,
): void {
  attachToolResult(state.toolCalls, toolName, toolCallId, output);

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
  if (state.inThought) {
    if (!isQuietMode()) process.stdout.write(endThought());
    state.inThought = false;
  }

  state.stepCount++;

  // Add blank line between tool call results and follow-up content
  // (skip when usage is shown — usage line already provides the gap)
  if (state.hadToolCalls && !state.showUsage && !isQuietMode()) {
    process.stdout.write("\n");
  }
}

/**
 * Finish stream processing (close thought block, add newline)
 *
 * @param state - Stream state
 */
function finishStream(state: StreamState): void {
  maybeWarnEmptyTurn(state);

  if (isQuietMode()) return;

  if (state.inThought) process.stdout.write(endThought());

  // Skip trailing newline when usage is shown — onStepFinish adds its own
  if (!state.showUsage) process.stdout.write("\n");
}

/**
 * Warn when a turn produced nothing usable. A turn with no text, tool calls, or
 * error AND no reasoning usually means the request reached a server that
 * returned a non-streaming/200 body (e.g. a wrong base URL path) — surface it
 * loudly, even in quiet grading runs. A reasoning-only turn (a thinking model
 * that exhausted its output budget mid-thought: finishReason "length", no error
 * part) is a NORMAL finish, so don't cry "check the base URL" — note it only in
 * verbose mode.
 *
 * @param state - Stream state
 */
function maybeWarnEmptyTurn(state: StreamState): void {
  const empty =
    state.error == null &&
    state.text.length === 0 &&
    state.toolCalls.length === 0;

  if (!empty) return;

  if (state.sawReasoning) {
    if (!isQuietMode()) {
      process.stderr.write(
        formatWarning(
          "Assistant produced only reasoning and no output — the output-token " +
            "budget was likely exhausted mid-thought.",
        ) + "\n",
      );
    }

    return;
  }

  process.stderr.write(
    formatWarning(
      "Assistant returned an empty response (no text, tool calls, or error). " +
        "Check the model name and base URL (e.g. a missing /v1 path).",
    ) + "\n",
  );
}

/**
 * Attach a tool result to the matching tool call
 *
 * @param toolCalls - Array of tool calls to search
 * @param toolName - Name of the tool that produced the result
 * @param toolCallId - Id of the originating tool call
 * @param output - Tool output to attach
 */
function attachToolResult(
  toolCalls: TurnResult["toolCalls"],
  toolName: string,
  toolCallId: string,
  output: unknown,
): void {
  // Match on the id first, but only a non-empty id: two same-name calls in one
  // step (the SDK emits both tool-call parts before either result) would
  // otherwise get their results swapped by name-only matching, silently
  // mis-scoring per-clip grading. A spec-violating server that emits
  // empty-string ids would cross-match every "" result onto the first ""-id
  // call (overwriting it, starving the rest), so "" falls through to the
  // name-based fallback — which is exactly what the fallback exists to handle.
  const byId = toolCallId
    ? toolCalls.find((tc) => tc.toolCallId === toolCallId)
    : undefined;

  if (byId != null) {
    byId.result = formatOutput(output);

    return;
  }

  // Fallback for parts without an id: last call of this name lacking a result.
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
  return mcpResultText(output) || JSON.stringify(output);
}
