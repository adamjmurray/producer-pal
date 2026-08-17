// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The Codex CLI's half of the agent-CLI transport contract: `codex exec --json`
 * argv, and the JSONL event schema it streams back.
 */

import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import {
  type AgentStreamState,
  parseAgentCliStream,
  recordToolResult,
  tokenCount,
  toToolArguments,
} from "../agent-cli/agent-cli-stream.ts";
import {
  type AgentCliArgsInput,
  type AgentCliTransport,
  type AgentCliTurnArgsInput,
  MCP_SERVER_NAME,
  type ParsedAgentTurn,
} from "../agent-cli/agent-cli-transport.ts";

export const CODEX_MODEL_ALIASES: Record<string, string> = {
  luna: "gpt-5.6-luna",
  sol: "gpt-5.6-sol",
  terra: "gpt-5.6-terra",
};

export const CODEX_CLI_TRANSPORT: AgentCliTransport = {
  provider: "codex-code",
  label: "codex CLI",
  bin: "codex",
  binEnvVar: "CODEX_BIN",
  tmpPrefix: "producer-pal-codex-",
  strippedEnvVars: ["CODEX_API_KEY", "OPENAI_API_KEY", "OPENAI_KEY"],
  // Fixed alias set (no models endpoint); read from the aliases so a listing
  // can't advertise a name the CLI can't resolve.
  models: Object.keys(CODEX_MODEL_ALIASES).toSorted(),
  judgeModel: "luna",
  buildTurnArgs: codexTurnArgs,
  buildJudgeArgs: codexJudgeArgs,
  parseStream: parseCodexStream,
  countSteps: countCodexSteps,
};

/**
 * Build arguments for an initial or resumed Codex eval turn.
 * @param input - Model, instructions, MCP URL, and optional session ID
 * @returns Codex CLI arguments
 */
export function codexTurnArgs(input: AgentCliTurnArgsInput): string[] {
  const common = [
    ...buildRestrictedArgs(input),
    "-c",
    `mcp_servers.${MCP_SERVER_NAME}.url=${JSON.stringify(input.mcpUrl)}`,
    "-c",
    `mcp_servers.${MCP_SERVER_NAME}.required=true`,
    "-c",
    `mcp_servers.${MCP_SERVER_NAME}.default_tools_approval_mode="approve"`,
  ];

  if (input.resumeSessionId != null) {
    return ["exec", "resume", ...common, input.resumeSessionId, "-"];
  }

  return ["exec", "--sandbox", "read-only", ...common, "-"];
}

/**
 * Build arguments for an isolated Codex judge call.
 * @param input - Model and instructions for the judge
 * @returns Codex CLI arguments
 */
export function codexJudgeArgs(input: AgentCliArgsInput): string[] {
  return [
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    ...buildRestrictedArgs(input),
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
 * Parse one Codex JSONL turn into the shared eval result shape.
 * @param stdout - Codex JSONL stdout
 * @returns Parsed assistant text, MCP calls, session ID, and token usage
 */
export function parseCodexStream(stdout: string): ParsedAgentTurn {
  return parseAgentCliStream(stdout, {
    label: "codex CLI",
    // Codex emits its message as one `agent_message` item, so parts concatenate.
    textSeparator: "",
    handleEvent,
  });
}

/**
 * Count the tool calls in one Codex event, for the step budget.
 *
 * Codex marks no boundary between model generations, so there is nothing to
 * collapse a narrated tool call onto — counting its `agent_message` too made the
 * same budget buy roughly half the tool work it buys on the AI SDK path, where a
 * step is one generation. Tool calls alone are the closest stand-in. Only
 * `item.completed`, so a call that starts and never returns is left to the
 * wall-clock timeout rather than counted twice.
 *
 * A turn that only ever talks is not a runaway to catch here: with no tool call
 * the model has nothing to loop on, and Codex ends the turn.
 *
 * @param event - Parsed Codex event
 * @returns Steps this event spent
 */
export function countCodexSteps(event: Record<string, unknown>): number {
  if (event.type !== "item.completed") return 0;
  const item = event.item;

  if (item == null || typeof item !== "object") return 0;

  return (item as Record<string, unknown>).type === "mcp_tool_call" ? 1 : 0;
}

/**
 * Build arguments shared by MCP turns and judge calls.
 * @param input - Model and instructions
 * @returns Restricted Codex CLI arguments
 */
function buildRestrictedArgs(input: AgentCliArgsInput): string[] {
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
    // Off, or every installed Codex app comes back as MCP tools — including a
    // second Producer Pal competing with the eval's own server.
    // --ignore-user-config does not cover it.
    "--disable",
    "apps",
    "--model",
    resolveCodexModel(input.model),
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    "-c",
    'sandbox_mode="read-only"',
    "-c",
    `model_instructions_file=${JSON.stringify(input.instructionsFile)}`,
  ];
}

/**
 * Apply a Codex stream event to the current turn accumulator.
 * @param event - Parsed Codex event
 * @param state - Mutable turn accumulator
 */
function handleEvent(
  event: Record<string, unknown>,
  state: AgentStreamState,
): void {
  if (event.type === "thread.started" && typeof event.thread_id === "string") {
    state.sessionId = event.thread_id;
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
function handleItem(itemValue: unknown, state: AgentStreamState): void {
  if (itemValue == null || typeof itemValue !== "object") return;
  const item = itemValue as Record<string, unknown>;

  if (item.type === "agent_message" && typeof item.text === "string") {
    state.textParts.push(item.text);
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
  state: AgentStreamState,
): void {
  const key = callKey(item);

  if (key == null) return;

  let call = state.openCalls.get(key);

  if (call == null) {
    if (typeof item.tool !== "string") return;
    call = { name: item.tool, args: toToolArguments(item.arguments) };
    state.toolCalls.push(call);
    state.openCalls.set(key, call);
  } else {
    // `item.started` can carry empty `arguments`, with the real ones only on
    // completion — so let a non-empty payload replace what landed first.
    const args = toToolArguments(item.arguments);

    if (Object.keys(args).length > 0) call.args = args;
  }

  if (item.result != null) recordToolResult(call, item.result);

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
 * Map Codex token counters to the shared usage shape.
 * @param value - Raw turn usage
 * @returns Shared token usage or undefined
 */
function mapCodexUsage(value: unknown): TokenUsage | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = tokenCount(usage.input_tokens);
  const outputTokens = tokenCount(usage.output_tokens);
  const result: TokenUsage = {
    inputTokens,
    outputTokens,
  };
  const cached = tokenCount(usage.cached_input_tokens);
  const reasoning = tokenCount(usage.reasoning_output_tokens);

  if (cached > 0) result.cacheReadTokens = cached;
  if (reasoning > 0) result.reasoningTokens = reasoning;

  return result;
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
