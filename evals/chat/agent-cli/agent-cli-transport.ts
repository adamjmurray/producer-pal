// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The contract every agent-CLI eval transport implements.
 *
 * These transports drive a coding-agent CLI (Codex, Claude Code, …) as a
 * subprocess instead of calling a model API: the CLI owns the conversation and
 * the MCP connection, we hand it a prompt on stdin and read a JSONL event
 * stream back. That buys subscription auth instead of metered API keys, at the
 * cost of one CLI-shaped argv and event schema per vendor.
 *
 * Everything those two schemas do NOT differ on — spawning, temp session dirs,
 * carrying a session id across turns, rendering a turn, judging — lives in the
 * sibling modules here and is shared. A transport is only the vendor-specific
 * part: argv, stream parsing, and model naming.
 */

import { type EvalProvider } from "#evals/scenarios/types.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { type ToolCall } from "../shared/types.ts";

export const DEFAULT_AGENT_CLI_SYSTEM_PROMPT =
  "You are Producer Pal, an AI assistant for music production in Ableton Live. " +
  "Use only the available Producer Pal MCP tools (ppal-*) to inspect or change " +
  "the Live Set. Do not use shell commands, files, web search, or subagents.";

/** The MCP server name every transport registers Producer Pal under. */
export const MCP_SERVER_NAME = "producer-pal";

/** Inputs shared by MCP turns and standalone judge calls. */
export interface AgentCliArgsInput {
  /** System instructions text, for CLIs that take it on argv. */
  instructions: string;
  /** File holding the same text, for CLIs that take a path. */
  instructionsFile: string;
  /** Friendly alias or explicit model id. */
  model: string;
}

/** Inputs for one turn of an MCP-connected session. */
export interface AgentCliTurnArgsInput extends AgentCliArgsInput {
  mcpUrl: string;
  /** Session id captured from an earlier turn; absent on the first turn. */
  resumeSessionId?: string;
}

/** One parsed turn, in the shape the scenario runner grades. */
export interface ParsedAgentTurn {
  text: string;
  toolCalls: ToolCall[];
  /** The CLI's own conversation id, replayed to resume the next turn. */
  sessionId?: string;
  usage?: TokenUsage;
}

export interface AgentCliTransport {
  /** Eval provider id this transport backs (`-m <provider>/<model>`). */
  provider: EvalProvider;
  /** CLI name, used in error messages. */
  label: string;
  /** Executable to spawn. */
  bin: string;
  /** Env var overriding `bin` — also the test seam for a fixture binary. */
  binEnvVar: string;
  /** mkdtemp prefix for a session's working directory. */
  tmpPrefix: string;
  /**
   * Env vars removed before spawning, so the CLI falls back to the logged-in
   * subscription instead of billing an API key that happens to be exported.
   */
  strippedEnvVars: string[];
  /** Friendly model names `--list-models` advertises for this provider. */
  models: string[];
  /** Model this provider judges with, kept distinct from the one under test. */
  judgeModel: string;
  /** Build argv for an initial or resumed MCP turn. Each transport resolves
   *  its own friendly aliases, so `model` arrives exactly as the user typed. */
  buildTurnArgs: (input: AgentCliTurnArgsInput) => string[];
  /** Build argv for an isolated judge call (no MCP, no tools). */
  buildJudgeArgs: (input: AgentCliArgsInput) => string[];
  /** Parse one turn's JSONL stdout, throwing on a reported failure. */
  parseStream: (stdout: string) => ParsedAgentTurn;
}

/**
 * Copy an environment without the vars that would redirect a CLI off its
 * logged-in subscription (and without the undefined values spawn rejects).
 *
 * @param env - Parent process environment
 * @param stripped - Variable names to drop
 * @returns Environment safe to hand to the CLI
 */
export function scrubAgentCliEnv(
  env: NodeJS.ProcessEnv,
  stripped: string[],
): Record<string, string> {
  const drop = new Set(stripped);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && !drop.has(key)) result[key] = value;
  }

  return result;
}
