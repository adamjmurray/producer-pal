// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI stream processor for AI SDK streamText() results.
 * Processes stream events and prints to terminal with formatting.
 */

import { type LanguageModelUsage, type streamText } from "ai";
import { isQuietMode } from "#evals/scenarios/helpers/quiet-mode.ts";
import { type TokenUsage, toTokenUsage } from "#webui/chat/sdk/types.ts";
import {
  continueThought,
  describeStreamError,
  endThought,
  formatError,
  formatToolCall,
  formatToolResult,
  formatWarning,
  printStepUsage,
  startThought,
} from "./shared/formatting.ts";
import {
  mcpResultInjectedBlocks,
  mcpResultText,
  mcpResultWarnings,
} from "./shared/mcp-result-text.ts";
import { type StepPerformance, toStepTiming } from "./shared/step-timing.ts";
import { type TurnResult } from "./shared/types.ts";

/** Mutable state tracked during stream processing */
interface StreamState {
  text: string;
  inThought: boolean;
  toolCalls: TurnResult["toolCalls"];
  hadToolCalls: boolean;
  showUsage: boolean;
  stepCount: number;
  /** Tool calls seen in the current step — drives the usage line's spacing. */
  stepToolCalls: number;
  /** Previous step's usage, for the usage line's "new content" figure. */
  prevUsage?: TokenUsage;
  /** True once any reasoning-delta arrived — distinguishes a reasoning-only
   * turn (normal thinking-model finish) from a truly empty one. */
  sawReasoning: boolean;
  /** Errored tool-call ids from the MCP bridge — see {@link processCliStream}. */
  erroredToolCallIds?: Set<string>;
  error?: string;
}

/**
 * Process a streamText result stream and print events to the terminal.
 * Returns a TurnResult with the collected text and tool calls for assertions.
 *
 * @param result - The streamText result to process
 * @param options - Processing options
 * @param options.showUsage - Whether to print each step's usage line
 * @param options.prevUsage - Usage of the last step of the previous turn, so
 *   the first step's "new content" figure counts the new user message
 * @param options.erroredToolCallIds - Ids of calls whose MCP result carried
 *   `isError: true` (from `createMcpTools`). The flag can't ride on the result
 *   itself — that string is the model's context — so it arrives on the side.
 * @returns TurnResult with text and tool calls
 */
export async function processCliStream(
  result: ReturnType<typeof streamText>,
  options?: {
    showUsage?: boolean;
    prevUsage?: TokenUsage;
    erroredToolCallIds?: Set<string>;
  },
): Promise<TurnResult> {
  const state: StreamState = {
    text: "",
    inThought: false,
    toolCalls: [],
    hadToolCalls: false,
    showUsage: options?.showUsage ?? false,
    stepCount: 0,
    stepToolCalls: 0,
    sawReasoning: false,
    ...(options?.prevUsage != null && { prevUsage: options.prevUsage }),
    ...(options?.erroredToolCallIds != null && {
      erroredToolCallIds: options.erroredToolCallIds,
    }),
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
    case "finish-step":
      handleFinishStep(
        part.usage as LanguageModelUsage | undefined,
        part.performance as StepPerformance | undefined,
        state,
      );
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
 * End an open thought block on stdout, so what follows doesn't print inside it.
 *
 * @param state - Mutable stream state
 */
function closeThought(state: StreamState): void {
  if (!state.inThought) {
    return;
  }

  if (!isQuietMode()) {
    process.stdout.write(endThought());
  }

  state.inThought = false;
}

/**
 * Handle text-delta stream event
 *
 * @param text - Text delta content
 * @param state - Mutable stream state
 */
function handleTextDelta(text: string, state: StreamState): void {
  closeThought(state);

  state.text += text;

  if (!isQuietMode()) {
    process.stdout.write(text);
  }
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

  if (isQuietMode()) {
    return;
  }

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
  state.stepToolCalls++;

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
  attachToolResult(state, toolName, toolCallId, output);

  if (!isQuietMode()) {
    process.stdout.write(
      formatToolResult(formatOutput(output), mcpResultWarnings(output)),
    );
  }
}

/**
 * Handle start-step stream event (end any open thought block)
 *
 * @param state - Mutable stream state
 */
function handleStartStep(state: StreamState): void {
  closeThought(state);

  state.stepCount++;
  state.stepToolCalls = 0;

  // Add blank line between tool call results and follow-up content
  // (skip when usage is shown — usage line already provides the gap)
  if (state.hadToolCalls && !state.showUsage && !isQuietMode()) {
    process.stdout.write("\n");
  }
}

/**
 * Handle finish-step: print the step's token usage and generation speed.
 *
 * This lives here rather than in streamText's onStepEnd callback: that callback
 * runs while the part is still in flight, so its line could print ahead of the
 * step's own output. Printing from the consume loop fixes the order.
 *
 * @param usage - The step's token usage, as the SDK reports it
 * @param performance - The step's timings, as the SDK measured them
 * @param state - Mutable stream state
 */
function handleFinishStep(
  usage: LanguageModelUsage | undefined,
  performance: StepPerformance | undefined,
  state: StreamState,
): void {
  if (usage == null) {
    return;
  }

  const stepUsage = toTokenUsage(usage);

  if (state.showUsage) {
    printStepUsage(
      stepUsage,
      state.prevUsage,
      state.stepToolCalls === 0,
      toStepTiming(performance),
    );
  }

  state.prevUsage = stepUsage;
}

/**
 * Finish stream processing (close thought block, add newline)
 *
 * @param state - Stream state
 */
function finishStream(state: StreamState): void {
  maybeWarnEmptyTurn(state);

  if (isQuietMode()) {
    return;
  }

  closeThought(state);

  // Skip trailing newline when usage is shown — the usage line adds its own
  if (!state.showUsage) {
    process.stdout.write("\n");
  }
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

  if (!empty) {
    return;
  }

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
 * @param state - Mutable stream state (tool calls + errored-id set)
 * @param toolName - Name of the tool that produced the result
 * @param toolCallId - Id of the originating tool call
 * @param output - Tool output to attach
 */
function attachToolResult(
  state: StreamState,
  toolName: string,
  toolCallId: string,
  output: unknown,
): void {
  const toolCalls = state.toolCalls;
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
    recordOutput(byId, output);

    // The id matched, so the MCP flag is authoritative: record false as well as
    // true. The name-based fallback below has no reliable id, so it leaves
    // isError unset and grading falls back to reading the result's shape.
    if (state.erroredToolCallIds != null) {
      byId.isError = state.erroredToolCallIds.has(toolCallId);
    }

    return;
  }

  // Fallback for parts without an id: last call of this name lacking a result.
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const tc = toolCalls[i] as TurnResult["toolCalls"][number];

    if (tc.name === toolName && tc.result == null) {
      recordOutput(tc, output);

      return;
    }
  }
}

/**
 * Store a tool's output on its call: the payload string plus any relayed
 * `WARNING:` blocks, which sit in later content blocks and would otherwise be
 * dropped by the payload-only unwrapping.
 *
 * @param toolCall - The call the output belongs to
 * @param output - Raw tool output
 */
function recordOutput(
  toolCall: TurnResult["toolCalls"][number],
  output: unknown,
): void {
  toolCall.result = formatOutput(output);

  const warnings = mcpResultWarnings(output);

  if (warnings.length > 0) {
    toolCall.warnings = warnings;
  }

  const injected = mcpResultInjectedBlocks(output);

  if (injected.length > 0) {
    toolCall.injectedBlocks = injected;
  }
}

/**
 * Format tool output for display and storage
 *
 * @param output - Raw tool output (may be MCP content array or other)
 * @returns Formatted string
 */
function formatOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (output == null) {
    return "";
  }

  // MCP content array format: [{ type: "text", text: "..." }]
  return mcpResultText(output) || JSON.stringify(output);
}
