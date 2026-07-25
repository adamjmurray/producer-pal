// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { type ToolCall } from "../shared/types.ts";

export const CODEX_MODEL_ALIASES: Record<string, string> = {
  luna: "gpt-5.6-luna",
  sol: "gpt-5.6-sol",
  terra: "gpt-5.6-terra",
};

export const DEFAULT_CODEX_SYSTEM_PROMPT =
  "You are Producer Pal, an AI assistant for music production in Ableton Live. " +
  "Use only the available Producer Pal MCP tools (ppal-*) to inspect or change " +
  "the Live Set. Do not use shell commands, files, web search, or subagents.";

export interface CodexSessionArgsInput {
  instructionsFile: string;
  mcpUrl: string;
  model: string;
  resumeThreadId?: string;
}

/**
 * Build arguments for an initial or resumed Codex eval turn.
 * @param input - Model, instructions, MCP URL, and optional thread ID
 * @returns Codex CLI arguments
 */
export function codexCliProtocol(input: CodexSessionArgsInput): string[] {
  const common = buildCommonArgs(input);

  if (input.resumeThreadId != null) {
    return ["exec", "resume", ...common, input.resumeThreadId, "-"];
  }

  return ["exec", "--sandbox", "read-only", ...common, "-"];
}

/**
 * Build arguments for an isolated Codex judge call.
 * @param model - Friendly alias or explicit model ID
 * @param instructionsFile - Absolute path to judge instructions
 * @returns Codex CLI arguments
 */
export function codexJudgeArgs(
  model: string,
  instructionsFile: string,
): string[] {
  return [
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    ...buildRestrictedArgs(model, instructionsFile),
    "-",
  ];
}

/**
 * Resolve a friendly Sol, Terra, or Luna alias to its Codex model ID.
 * @param model - Friendly alias or explicit model ID
 * @returns Resolved model ID
 */
export function resolveCodexModel(model: string): string {
  return CODEX_MODEL_ALIASES[model] ?? model;
}

/**
 * Remove OpenAI API keys so Codex uses the logged-in subscription.
 * @param env - Parent process environment
 * @returns Environment without OpenAI API keys or undefined values
 */
export function scrubOpenAiKeys(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const stripped = new Set(["CODEX_API_KEY", "OPENAI_API_KEY", "OPENAI_KEY"]);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && !stripped.has(key)) result[key] = value;
  }

  return result;
}

export interface ParsedCodexTurn {
  text: string;
  toolCalls: ToolCall[];
  threadId?: string;
  usage?: TokenUsage;
}

/**
 * Parse one Codex JSONL turn into the shared eval result shape.
 * @param stdout - Codex JSONL stdout
 * @returns Parsed assistant text, MCP calls, thread ID, and token usage
 */
export function parseCodexStream(stdout: string): ParsedCodexTurn {
  const state: CodexStreamState = {
    text: "",
    toolCalls: [],
    openCalls: new Map(),
  };

  for (const line of stdout.split("\n")) {
    const event = parseLine(line);

    if (event != null) handleEvent(event, state);
  }

  if (state.error != null) throw new Error(`codex CLI error: ${state.error}`);

  return {
    text: state.text,
    toolCalls: state.toolCalls,
    ...(state.threadId != null ? { threadId: state.threadId } : {}),
    ...(state.usage != null ? { usage: state.usage } : {}),
  };
}

interface CodexStreamState {
  text: string;
  toolCalls: ToolCall[];
  /** In-flight MCP calls awaiting completion, keyed by callKey(). */
  openCalls: Map<string, ToolCall>;
  threadId?: string;
  usage?: TokenUsage;
  error?: string;
}

/**
 * Build restrictions and the Producer Pal MCP configuration.
 * @param input - Model, instructions, and MCP session options
 * @returns CLI arguments shared by initial and resumed turns
 */
function buildCommonArgs(input: CodexSessionArgsInput): string[] {
  return [
    ...buildRestrictedArgs(input.model, input.instructionsFile),
    "-c",
    `mcp_servers.producer-pal.url=${JSON.stringify(input.mcpUrl)}`,
    "-c",
    "mcp_servers.producer-pal.required=true",
    "-c",
    'mcp_servers.producer-pal.default_tools_approval_mode="approve"',
  ];
}

/**
 * Build arguments shared by MCP turns and judge calls.
 * @param model - Friendly alias or explicit model ID
 * @param instructionsFile - Absolute path to base instructions
 * @returns Restricted Codex CLI arguments
 */
function buildRestrictedArgs(
  model: string,
  instructionsFile: string,
): string[] {
  return [
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--disable",
    "shell_tool",
    "--disable",
    "unified_exec",
    "--disable",
    "multi_agent",
    "--model",
    resolveCodexModel(model),
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    "-c",
    'sandbox_mode="read-only"',
    "-c",
    `model_instructions_file=${JSON.stringify(instructionsFile)}`,
  ];
}

/**
 * Parse a JSONL line, ignoring diagnostics written to stdout.
 * @param line - One stdout line
 * @returns Parsed event or undefined for non-JSON output
 */
function parseLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();

  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Apply a Codex stream event to the current turn accumulator.
 * @param event - Parsed Codex event
 * @param state - Mutable turn accumulator
 */
function handleEvent(
  event: Record<string, unknown>,
  state: CodexStreamState,
): void {
  if (event.type === "thread.started" && typeof event.thread_id === "string") {
    state.threadId = event.thread_id;
  } else if (event.type === "turn.completed") {
    state.usage = mapCodexUsage(event.usage);
  } else if (event.type === "turn.failed" || event.type === "error") {
    state.error = getErrorMessage(event);
  } else if (event.type === "item.started" || event.type === "item.completed") {
    handleItem(event.item, state);
  }
}

/**
 * Collect agent messages and MCP tool items.
 * @param itemValue - Event item payload
 * @param state - Mutable turn accumulator
 */
function handleItem(itemValue: unknown, state: CodexStreamState): void {
  if (itemValue == null || typeof itemValue !== "object") return;
  const item = itemValue as Record<string, unknown>;

  if (item.type === "agent_message" && typeof item.text === "string") {
    state.text += item.text;
  } else if (item.type === "mcp_tool_call") {
    collectMcpCall(item, state);
  }
}

/**
 * Add or complete an MCP call while avoiding started/completed duplicates.
 * @param item - MCP tool-call item
 * @param state - Mutable turn accumulator
 */
function collectMcpCall(
  item: Record<string, unknown>,
  state: CodexStreamState,
): void {
  const key = callKey(item);

  if (key == null) return;

  let call = state.openCalls.get(key);

  if (call == null) {
    if (typeof item.tool !== "string") return;
    call = { name: item.tool, args: toArguments(item.arguments) };
    state.toolCalls.push(call);
    state.openCalls.set(key, call);
  } else {
    // `item.started` can carry empty `arguments`, with the real ones only on
    // completion — so let a non-empty payload replace what landed first.
    const args = toArguments(item.arguments);

    if (Object.keys(args).length > 0) call.args = args;
  }

  if (item.result != null) call.result = stringifyResult(item.result);

  if (item.status === "failed") {
    const message = getErrorMessage(item);

    call.result ??= `ERROR: ${message}`;
  }

  // Stop tracking once the call is done, so a later call to the same tool
  // starts a fresh entry instead of merging into this one.
  if (isFinishedCall(item)) state.openCalls.delete(key);
}

/**
 * Key an MCP item so `item.started` and `item.completed` collapse into one
 * entry. `item.id` is optional in the stream; without it, pair the events by
 * tool name (only one call per tool is ever in flight at a time).
 * @param item - MCP tool-call item
 * @returns Dedup key, or undefined when the item identifies neither
 */
function callKey(item: Record<string, unknown>): string | undefined {
  if (typeof item.id === "string") return `id:${item.id}`;
  if (typeof item.tool === "string") return `tool:${item.tool}`;

  return undefined;
}

/**
 * Report whether an MCP item represents a finished call.
 * @param item - MCP tool-call item
 * @returns True when the call succeeded, failed, or carries a result
 */
function isFinishedCall(item: Record<string, unknown>): boolean {
  return (
    item.status === "completed" ||
    item.status === "failed" ||
    item.result != null
  );
}

/**
 * Normalize object or JSON-string tool arguments.
 * @param value - Raw Codex arguments
 * @returns Object arguments for the shared tool-call shape
 */
function toArguments(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (
        parsed != null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Map Codex token counters to the shared usage shape.
 * @param value - Raw turn usage
 * @returns Shared token usage or undefined
 */
function mapCodexUsage(value: unknown): TokenUsage | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = numberValue(usage.input_tokens);
  const outputTokens = numberValue(usage.output_tokens);
  const result: TokenUsage = {
    inputTokens,
    outputTokens,
  };
  const cached = numberValue(usage.cached_input_tokens);
  const reasoning = numberValue(usage.reasoning_output_tokens);

  if (cached > 0) result.cacheReadTokens = cached;
  if (reasoning > 0) result.reasoningTokens = reasoning;

  return result;
}

/**
 * Return a numeric counter or zero when absent.
 * @param value - Raw counter
 * @returns Numeric counter
 */
function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/**
 * Serialize a Codex MCP result for eval reports.
 * @param value - Raw MCP result
 * @returns String result
 */
function stringifyResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Extract a useful message from the event's supported error shapes.
 * @param value - Event or MCP item containing an error
 * @returns Error message
 */
function getErrorMessage(value: Record<string, unknown>): string {
  if (typeof value.message === "string") return value.message;
  const error = value.error;

  if (typeof error === "string") return error;

  if (error != null && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;

    if (typeof message === "string") return message;
  }

  return "unknown error";
}
