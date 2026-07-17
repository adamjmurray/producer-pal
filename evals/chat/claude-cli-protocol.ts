// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pure helpers for the Claude-CLI eval transport (no IO here — see claude-cli.ts
 * for the subprocess). Split out so arg/env/stream-parsing logic is unit-testable
 * without spawning `claude`.
 *
 * Mechanism (borrowed from Signal Studio's CliModelClient): spawning `claude --print`
 * with ANTHROPIC_API_KEY stripped forces Claude Code to bill against the Claude Max
 * subscription (OAuth) instead of the metered API. The difference here: Producer Pal's
 * evals need agentic *tool calling*, so we ENABLE an MCP server (Producer Pal over HTTP)
 * rather than disabling MCP the way a single-shot judge would.
 */

import { type TokenUsage, type ToolCall } from "./shared/types.ts";

/** Default Producer Pal MCP endpoint (matches ai-sdk-mcp.ts). */
export const DEFAULT_MCP_URL = "http://localhost:3350/mcp";

/** MCP server key used in the generated --mcp-config; sets the mcp__<key>__ tool prefix. */
export const MCP_SERVER_KEY = "producer-pal";

/**
 * Default system prompt for agentic turns, used to REPLACE Claude Code's built-in
 * coding-agent prompt (via --system-prompt). Without this, the coding-agent framing
 * biases models — especially small ones — toward hedging ("could you clarify?")
 * instead of using the Producer Pal tools, which is unrepresentative of how a real
 * Producer Pal user (e.g. Claude Desktop) interacts. This is neutral role context,
 * not a "always call tools" nudge, so it doesn't game the eval. A scenario's own
 * `instructions` override it.
 */
export const DEFAULT_SYSTEM_PROMPT =
  "You are Producer Pal, an AI assistant for music production in Ableton Live. " +
  "You have access to tools (ppal-*) to inspect and edit the user's Live Set — " +
  "tracks, clips, scenes, devices, and playback. Help the user accomplish their " +
  "music tasks.";

/**
 * Strip ANTHROPIC_API_KEY (and the eval harness's ANTHROPIC_KEY) so the spawned
 * `claude` falls back to Max OAuth from the keychain. Claude Code silently prefers
 * an API key when present and would bill the metered API instead.
 *
 * @param env - The parent process environment
 * @returns A copy of env with Anthropic API keys removed
 */
export function scrubAnthropicKey(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const stripped = new Set(["ANTHROPIC_API_KEY", "ANTHROPIC_KEY"]);
  const out: Record<string, string> = {};

  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && !stripped.has(k)) out[k] = v;
  }

  return out;
}

/**
 * Build the inline JSON for `--mcp-config` pointing Claude Code at the Producer Pal
 * HTTP MCP server. The server key becomes the mcp__<key>__ tool-name prefix.
 *
 * @param url - Producer Pal MCP URL
 * @returns A JSON string suitable for `--mcp-config`
 */
export function buildMcpConfig(url: string = DEFAULT_MCP_URL): string {
  return JSON.stringify({
    mcpServers: { [MCP_SERVER_KEY]: { type: "http", url } },
  });
}

export interface SessionArgsInput {
  /** Model alias or id (e.g. "sonnet", "haiku", "claude-haiku-4-5-20251001"). */
  model: string;
  /** Inline JSON for --mcp-config (see buildMcpConfig). */
  mcpConfig: string;
  /** Resume a prior turn's session to preserve conversation + MCP context. */
  resumeSessionId?: string;
  /** System prompt that REPLACES Claude Code's default; falls back to DEFAULT_SYSTEM_PROMPT. */
  systemPrompt?: string;
}

/**
 * Build argv for an agentic, MCP-enabled `claude --print` turn (stream-json so we
 * can see intermediate tool_use blocks — plain json only returns the final text).
 *
 * --allowedTools "mcp__producer-pal" auto-approves every Producer Pal tool; with the
 * default permission mode, non-allowed built-ins (Bash, file edits, …) are denied in
 * print mode, keeping the run scoped to Producer Pal and safe against local damage.
 *
 * --system-prompt REPLACES Claude Code's coding-agent prompt with neutral Producer Pal
 * role context (see DEFAULT_SYSTEM_PROMPT) so the eval measures tool use, not coding bias.
 *
 * @param input - Model, MCP config, optional resume id and system prompt
 * @returns argv for spawning `claude`
 */
export function buildSessionArgs(input: SessionArgsInput): string[] {
  const args = [
    "--print",
    "--verbose", // required by the CLI when --print + --output-format stream-json
    "--output-format",
    "stream-json",
    "--strict-mcp-config",
    "--mcp-config",
    input.mcpConfig,
    "--allowedTools",
    `mcp__${MCP_SERVER_KEY}`,
    "--system-prompt",
    input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    "--model",
    input.model,
  ];

  if (input.resumeSessionId != null) {
    args.push("--resume", input.resumeSessionId);
  }

  return args;
}

/**
 * Build argv for a single-shot, MCP-disabled `claude --print` judge call — Signal
 * Studio's original shape. Plain json envelope is enough (no tools to observe).
 * --system-prompt replaces Claude Code's default so the judge returns only the
 * required JSON, uncolored by the coding-agent framing.
 *
 * @param model - Judge model alias or id
 * @param systemPrompt - Judge system instructions (replaces the default prompt)
 * @returns argv for spawning `claude`
 */
export function buildJudgeArgs(model: string, systemPrompt: string): string[] {
  return [
    "--print",
    "--output-format",
    "json",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--model",
    model,
    "--system-prompt",
    systemPrompt,
  ];
}

/**
 * Strip Claude Code's mcp__<server>__ prefix so tool names match the bare Producer
 * Pal names the assertions expect (e.g. "mcp__producer-pal__ppal-connect" →
 * "ppal-connect"). Non-MCP names pass through unchanged.
 *
 * @param name - Tool name as reported by Claude Code
 * @returns The bare tool name
 */
export function normalizeMcpToolName(name: string): string {
  if (!name.startsWith("mcp__")) return name;

  // "mcp__<server>__<tool>" — server and Producer Pal tool names use hyphens, not
  // "__", so the last "__"-delimited segment is the bare tool name.
  const parts = name.split("__");

  return parts.at(-1) ?? name;
}

/** Raw Anthropic usage shape from the CLI's stream-json / json output. */
interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Map Anthropic CLI usage to the harness TokenUsage. inputTokens is the full billed
 * prompt size (fresh + cache-creation + cache-read) so it is comparable to the AI SDK
 * path; cachedInputTokens records the discounted cache-read portion.
 *
 * @param usage - Raw usage object, if present
 * @returns Normalized TokenUsage, or undefined when no usage was reported
 */
export function mapUsage(usage: RawUsage | undefined): TokenUsage | undefined {
  if (usage == null) return undefined;

  const fresh = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const inputTokens = fresh + cacheRead + cacheCreate;
  const outputTokens = usage.output_tokens ?? 0;
  const result: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };

  if (cacheRead > 0) result.cachedInputTokens = cacheRead;

  return result;
}

/** Parsed result of one agentic `claude --print` turn. */
export interface ParsedTurn {
  text: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  sessionId?: string;
}

/**
 * Parse the newline-delimited stream-json output of one agentic turn: concatenates
 * assistant text, collects tool_use blocks (with bare tool names) and their results,
 * and reads the final `result` line for text, usage and session_id.
 *
 * @param stdout - Raw stream-json stdout from `claude --print`
 * @returns Parsed turn (text, tool calls, usage, session id)
 * @throws If the CLI reported an error result
 */
export function parseSessionStream(stdout: string): ParsedTurn {
  const state: StreamState = {
    toolCalls: [],
    toolCallsById: new Map(),
    assistantText: "",
  };

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    let obj: Record<string, unknown>;

    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue; // tolerate a stray non-JSON line
    }

    handleStreamLine(obj, state);
  }

  if (state.errored != null) {
    throw new Error(`claude CLI error result: ${state.errored.slice(0, 500)}`);
  }

  return {
    text: state.resultText ?? state.assistantText,
    toolCalls: state.toolCalls,
    ...(state.usage !== undefined ? { usage: state.usage } : {}),
    ...(state.sessionId !== undefined ? { sessionId: state.sessionId } : {}),
  };
}

/** Mutable accumulator threaded through the stream-json line handlers. */
interface StreamState {
  toolCalls: ToolCall[];
  toolCallsById: Map<string, ToolCall>;
  assistantText: string;
  resultText?: string;
  usage?: TokenUsage;
  sessionId?: string;
  errored?: string;
}

/**
 * Apply one parsed stream-json line to the accumulator.
 *
 * @param obj - The parsed line
 * @param state - Mutable stream accumulator
 */
function handleStreamLine(
  obj: Record<string, unknown>,
  state: StreamState,
): void {
  if (typeof obj.session_id === "string") state.sessionId = obj.session_id;

  if (obj.type === "assistant") {
    collectAssistant(obj, state);
  } else if (obj.type === "user") {
    attachToolResults(obj, state.toolCallsById);
  } else if (obj.type === "result") {
    if (obj.is_error === true) {
      state.errored =
        typeof obj.result === "string" ? obj.result : "unknown error";
    }

    if (typeof obj.result === "string") state.resultText = obj.result;
    state.usage = mapUsage(obj.usage as RawUsage | undefined) ?? state.usage;
  }
}

/**
 * Parse the single-shot `--output-format json` envelope used by the judge.
 *
 * @param stdout - Raw json stdout from `claude --print`
 * @returns The model's result text
 * @throws If stdout is not valid JSON or reports an error envelope
 */
export function parseJudgeEnvelope(stdout: string): string {
  let envelope: { is_error?: boolean; result?: string };

  try {
    envelope = JSON.parse(stdout) as { is_error?: boolean; result?: string };
  } catch (err) {
    throw new Error(
      `claude CLI judge: stdout was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (envelope.is_error) {
    throw new Error(
      `claude CLI judge: error envelope: ${(envelope.result ?? "").slice(0, 500)}`,
    );
  }

  return envelope.result ?? "";
}

/** Anthropic content block in an assistant message. */
interface ContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Pull text and tool_use blocks out of one assistant stream-json line.
 *
 * @param obj - The parsed assistant line
 * @param state - Mutable stream accumulator
 */
function collectAssistant(
  obj: Record<string, unknown>,
  state: StreamState,
): void {
  const message = obj.message as { content?: ContentBlock[] } | undefined;

  for (const block of message?.content ?? []) {
    if (block.type === "text" && block.text) {
      state.assistantText += block.text;
    } else if (block.type === "tool_use" && block.name) {
      const call: ToolCall = {
        name: normalizeMcpToolName(block.name),
        args: block.input ?? {},
      };

      state.toolCalls.push(call);
      if (block.id) state.toolCallsById.set(block.id, call);
    }
  }
}

/**
 * Attach tool_result text from a user stream-json line back onto its tool call.
 *
 * @param obj - The parsed user line
 * @param toolCallsById - Index from tool_use id to call
 */
function attachToolResults(
  obj: Record<string, unknown>,
  toolCallsById: Map<string, ToolCall>,
): void {
  const message = obj.message as
    | { content?: Array<Record<string, unknown>> }
    | undefined;

  for (const block of message?.content ?? []) {
    if (block.type !== "tool_result") continue;

    const id = block.tool_use_id;
    const call = typeof id === "string" ? toolCallsById.get(id) : undefined;

    if (call) call.result = stringifyToolResult(block.content);
  }
}

/**
 * Flatten an MCP tool_result content payload to a string.
 *
 * @param content - The tool_result content (string or content blocks)
 * @returns A string representation of the result
 */
function stringifyToolResult(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof (c as { text?: string }).text === "string"
          ? (c as { text: string }).text
          : JSON.stringify(c),
      )
      .join("");
  }

  return JSON.stringify(content);
}
