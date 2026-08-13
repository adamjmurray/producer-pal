// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Claude Code's half of the agent-CLI transport contract:
 * `claude -p --output-format stream-json` argv, and the JSONL event schema it
 * streams back.
 *
 * Isolation is by subtraction rather than a sandbox flag: `--tools ""` removes
 * every built-in tool (so only Producer Pal's MCP tools remain),
 * `--setting-sources ""` drops user/project/local settings and plugins,
 * `--disable-slash-commands` drops skills, `--strict-mcp-config` ignores MCP
 * servers configured anywhere else, and `--system-prompt` REPLACES Claude
 * Code's coding-agent prompt (and the memory injected into it) with the eval's
 * instructions. What survives is a plain Producer Pal assistant.
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
import { type ToolCall } from "../shared/types.ts";

/** Aliases the CLI resolves itself; explicit model ids also pass through. */
export const CLAUDE_CODE_MODELS = ["fable", "haiku", "opus", "sonnet"];

/** Tools from our MCP server arrive namespaced; strip it back to `ppal-*`. */
const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`;

export const CLAUDE_CODE_TRANSPORT: AgentCliTransport = {
  provider: "claude-code",
  label: "claude CLI",
  bin: "claude",
  binEnvVar: "CLAUDE_CODE_BIN",
  tmpPrefix: "producer-pal-claude-code-",
  // Claude Code prefers an exported API key over the logged-in subscription,
  // and the Bedrock/Vertex switches would route the turn to a third party.
  strippedEnvVars: [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
  ],
  models: CLAUDE_CODE_MODELS,
  judgeModel: "haiku",
  buildTurnArgs: claudeCodeTurnArgs,
  buildJudgeArgs: claudeCodeJudgeArgs,
  parseStream: parseClaudeCodeStream,
  countSteps: countClaudeCodeSteps,
};

/**
 * Build arguments for an initial or resumed Claude Code eval turn.
 * @param input - Model, instructions, MCP URL, and optional session ID
 * @returns Claude Code CLI arguments
 */
export function claudeCodeTurnArgs(input: AgentCliTurnArgsInput): string[] {
  const mcpConfig = {
    mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: input.mcpUrl } },
  };

  return [
    ...buildRestrictedArgs(input),
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    // Pre-approve the whole server: -p mode cannot prompt, and an unapproved
    // MCP call would come back denied rather than failing the run.
    "--allowedTools",
    `mcp__${MCP_SERVER_NAME}`,
    ...(input.resumeSessionId != null
      ? ["--resume", input.resumeSessionId]
      : []),
  ];
}

/**
 * Build arguments for an isolated Claude Code judge call.
 * @param input - Model and instructions for the judge
 * @returns Claude Code CLI arguments
 */
export function claudeCodeJudgeArgs(input: AgentCliArgsInput): string[] {
  return [
    ...buildRestrictedArgs(input),
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify({ mcpServers: {} }),
    // The judge is one shot and never resumes, so keep it out of the CLI's
    // on-disk session history.
    "--no-session-persistence",
  ];
}

/**
 * Parse one Claude Code JSONL turn into the shared eval result shape.
 * @param stdout - Claude Code JSONL stdout
 * @returns Parsed assistant text, MCP calls, session ID, and token usage
 */
export function parseClaudeCodeStream(stdout: string): ParsedAgentTurn {
  return parseAgentCliStream(stdout, {
    label: "claude CLI",
    // Assistant messages arrive as separate events; a blank line between them
    // keeps a pre-tool aside from running into the closing reply.
    textSeparator: "\n\n",
    handleEvent,
  });
}

/**
 * Count the model generations in one Claude Code event, for the step budget.
 *
 * One `assistant` event is one generation, so it costs one step however many
 * blocks it holds — which is what the AI SDK path's stepCountIs counts. Charging
 * per block instead made a narrated tool call cost two, so the same budget
 * bought a Claude Code turn roughly half the tool calls.
 *
 * @param event - Parsed Claude Code event
 * @returns Steps this event spent
 */
export function countClaudeCodeSteps(event: Record<string, unknown>): number {
  if (event.type !== "assistant") return 0;

  return messageContent(event).some(isModelAction) ? 1 : 0;
}

/**
 * Report whether an assistant block is a step rather than thinking.
 * @param block - One assistant content block
 * @returns True for a tool call or a non-empty reply
 */
function isModelAction(block: Record<string, unknown>): boolean {
  if (block.type === "tool_use") return true;

  return block.type === "text" && block.text !== "";
}

/**
 * Build the arguments shared by MCP turns and judge calls.
 *
 * `--tools ""` must be followed by another flag: it is variadic
 * (`--tools <tools...>`), so a bare value after it would be swallowed as a tool
 * name. `--setting-sources <sources>` takes a single comma-separated value and
 * has no such hazard; it is last-but-one only for readability.
 *
 * @param input - Model and instructions
 * @returns Restricted Claude Code CLI arguments
 */
function buildRestrictedArgs(input: AgentCliArgsInput): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    // stream-json output is rejected in print mode without it.
    "--verbose",
    "--model",
    input.model,
    "--system-prompt",
    input.instructions,
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--tools",
    "",
  ];
}

/**
 * Apply a Claude Code stream event to the current turn accumulator.
 * @param event - Parsed Claude Code event
 * @param state - Mutable turn accumulator
 */
function handleEvent(
  event: Record<string, unknown>,
  state: AgentStreamState,
): void {
  if (typeof event.session_id === "string") state.sessionId = event.session_id;

  if (event.type === "system" && event.subtype === "init") {
    state.error ??= mcpConnectionError(event.mcp_servers);
  } else if (event.type === "assistant") {
    for (const block of messageContent(event))
      handleAssistantBlock(block, state);
  } else if (event.type === "user") {
    for (const block of messageContent(event)) handleToolResult(block, state);
  } else if (event.type === "result") {
    state.usage = mapClaudeUsage(event.usage);
    state.error ??= permissionDenialError(event.permission_denials);
    state.error ??= resultError(event);
  }
}

/**
 * Read a message event's content blocks.
 * @param event - An `assistant` or `user` event
 * @returns The content blocks, or an empty list for an unexpected shape
 */
function messageContent(
  event: Record<string, unknown>,
): Record<string, unknown>[] {
  const message = event.message as { content?: unknown } | undefined;
  const content = message?.content;

  if (!Array.isArray(content)) return [];

  return content.filter(
    (block): block is Record<string, unknown> =>
      block != null && typeof block === "object",
  );
}

/**
 * Collect assistant text and tool calls, skipping thinking blocks.
 * @param block - One assistant content block
 * @param state - Mutable turn accumulator
 */
function handleAssistantBlock(
  block: Record<string, unknown>,
  state: AgentStreamState,
): void {
  if (block.type === "text" && typeof block.text === "string") {
    if (block.text !== "") state.textParts.push(block.text);
  } else if (block.type === "tool_use" && typeof block.name === "string") {
    const call: ToolCall = {
      name: stripMcpPrefix(block.name),
      args: toToolArguments(block.input),
    };

    state.toolCalls.push(call);

    if (typeof block.id === "string") state.openCalls.set(block.id, call);
  }
}

/**
 * Attach a tool result to the call that produced it.
 * @param block - One user content block
 * @param state - Mutable turn accumulator
 */
function handleToolResult(
  block: Record<string, unknown>,
  state: AgentStreamState,
): void {
  if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") {
    return;
  }

  const call = state.openCalls.get(block.tool_use_id);

  if (call == null) return;

  recordToolResult(call, block.content);

  if (block.is_error === true) call.result = `ERROR: ${call.result ?? ""}`;

  state.openCalls.delete(block.tool_use_id);
}

/**
 * Report an MCP server that failed to come up.
 *
 * Claude Code has no equivalent of Codex's `required=true` — it runs the turn
 * anyway, with no Producer Pal tools, and the run silently grades a model that
 * never had them. So treat a non-connected server as a failed turn.
 *
 * @param value - The init event's `mcp_servers` list
 * @returns Error message, or undefined when every configured server connected
 */
function mcpConnectionError(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;

  for (const item of value as unknown[]) {
    const entry = (item ?? {}) as { name?: unknown; status?: unknown };

    if (entry.status !== "connected") {
      return (
        `MCP server "${String(entry.name)}" is ${String(entry.status)}. ` +
        `Is Ableton Live running with the Producer Pal device?`
      );
    }
  }

  return undefined;
}

/**
 * Report tool calls the permission layer refused.
 *
 * The sibling of a dead MCP server, with the same silent outcome: if the
 * `--allowedTools` rule stops matching (renamed server, changed rule syntax),
 * the model calls its tools and every call comes back denied — which grades as
 * a model that tried and failed rather than a broken harness.
 *
 * ANY denial fails the turn, which is right only because `--tools ""` leaves
 * nothing but our MCP server to deny. Revisit if built-ins are ever re-enabled:
 * a denied `Bash` attempt would then be a model mistake, not a broken harness.
 *
 * @param value - The result event's `permission_denials` list
 * @returns Error message, or undefined when nothing was denied
 */
function permissionDenialError(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const names = (value as unknown[])
    .map((item) => ((item ?? {}) as { tool_name?: unknown }).tool_name)
    .map((name) => (typeof name === "string" ? name : "unknown"));

  return (
    `${names.length} tool call(s) denied by the permission layer: ` +
    `${[...new Set(names)].join(", ")}. Does --allowedTools still match?`
  );
}

/**
 * Extract a failure from the terminating `result` event.
 *
 * `subtype` is the specific label and is used whenever it says anything — but
 * the most common real failure, the API being unreachable, reports
 * `subtype: "success"` alongside `is_error: true`, which would read
 * "claude CLI error: success:". Fall back to `terminal_reason` there.
 *
 * @param event - The result event
 * @returns Error message, or undefined for a successful turn
 */
function resultError(event: Record<string, unknown>): string | undefined {
  if (event.is_error !== true && event.subtype === "success") return undefined;

  const detail =
    typeof event.result === "string" && event.result !== ""
      ? event.result
      : "no detail reported";
  const specific =
    event.subtype !== "success" ? firstString(event.subtype) : undefined;
  const reason =
    specific ?? firstString(event.terminal_reason, event.api_error_status);

  return reason == null ? detail : `${reason}: ${detail}`;
}

/**
 * Return the first value that is a non-empty string.
 * @param values - Candidate values from the event
 * @returns The first usable string, or undefined
 */
function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value;
  }

  return undefined;
}

/**
 * Strip our MCP namespace so tool names match every other transport's.
 * @param name - Tool name as Claude Code reports it
 * @returns Bare `ppal-*` name where applicable
 */
function stripMcpPrefix(name: string): string {
  return name.startsWith(MCP_TOOL_PREFIX)
    ? name.slice(MCP_TOOL_PREFIX.length)
    : name;
}

/**
 * Map Claude Code token counters to the shared usage shape.
 * @param value - Raw result usage
 * @returns Shared token usage or undefined
 */
function mapClaudeUsage(value: unknown): TokenUsage | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const result: TokenUsage = {
    inputTokens: tokenCount(usage.input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
  };
  const cacheRead = tokenCount(usage.cache_read_input_tokens);
  const cacheWrite = tokenCount(usage.cache_creation_input_tokens);

  if (cacheRead > 0) result.cacheReadTokens = cacheRead;
  if (cacheWrite > 0) result.cacheWriteTokens = cacheWrite;

  return result;
}
