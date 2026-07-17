// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * EvalSession backed by the Claude CLI running on the Claude Max subscription.
 *
 * Instead of driving an AI SDK LanguageModel through the harness's tool loop, this
 * hands the whole agentic turn to `claude --print` with Producer Pal wired in as an
 * MCP server. Claude Code executes the ppal-* tools itself (billed to Max), and we
 * parse its stream-json to recover the same { text, toolCalls, usage } the AI SDK
 * path produces — so runScenario and every assertion work unchanged.
 *
 * A separate raw MCP client (same Producer Pal server) backs `state` assertions,
 * exactly as the AI SDK session exposes `mcpClient`.
 */

import { type EvalSession } from "#evals/scenarios/eval-session.ts";
import { logTurnStart } from "#evals/scenarios/helpers/eval-session-base.ts";
import { connectMcp } from "./ai-sdk-mcp.ts";
import {
  buildMcpConfig,
  buildSessionArgs,
  DEFAULT_MCP_URL,
  parseSessionStream,
} from "./claude-cli-protocol.ts";
import { spawnClaude } from "./claude-cli.ts";
import { type TurnResult } from "./shared/types.ts";

/** Default model when `claude-code` is given with no explicit model. */
export const CLAUDE_CODE_DEFAULT_MODEL = "sonnet";

export interface ClaudeCliSessionOptions {
  /** Model alias or id (e.g. "sonnet", "haiku", "opus", or a pinned claude-* id). */
  model?: string;
  /** Optional system instructions, appended to Claude Code's default prompt. */
  instructions?: string;
  /** Producer Pal MCP URL (defaults to MCP_URL env or localhost:3350). */
  mcpUrl?: string;
}

/**
 * Create a Claude-CLI-backed evaluation session (Claude Max billing).
 *
 * @param options - Model, system instructions, and MCP URL
 * @returns An EvalSession compatible with runScenario
 */
export async function createClaudeCliSession(
  options: ClaudeCliSessionOptions,
): Promise<EvalSession> {
  const model = options.model ?? CLAUDE_CODE_DEFAULT_MODEL;
  const url = options.mcpUrl ?? process.env.MCP_URL ?? DEFAULT_MCP_URL;
  const mcpConfig = buildMcpConfig(url);

  // Raw MCP client for `state` assertions — same server Claude Code drives.
  const { client: mcpClient } = await connectMcp(url);

  // Resume id threads conversation + MCP context across multi-turn scenarios.
  let resumeSessionId: string | undefined;

  return {
    mcpClient,

    sendMessage: async (
      message: string,
      turnNumber: number,
    ): Promise<TurnResult> => {
      logTurnStart(turnNumber, message);

      const args = buildSessionArgs({
        model,
        mcpConfig,
        ...(resumeSessionId != null ? { resumeSessionId } : {}),
        // A scenario's own instructions replace the default Producer Pal prompt;
        // otherwise buildSessionArgs applies DEFAULT_SYSTEM_PROMPT.
        ...(options.instructions != null
          ? { systemPrompt: options.instructions }
          : {}),
      });

      const stdout = await spawnClaude(args, message);
      const parsed = parseSessionStream(stdout);

      // runScenario awaits each turn before sending the next, so this resume-id
      // update is strictly sequential — the race the rule guards against can't occur.
      // eslint-disable-next-line require-atomic-updates -- sequential multi-turn loop
      if (parsed.sessionId != null) resumeSessionId = parsed.sessionId;

      return {
        text: parsed.text,
        toolCalls: parsed.toolCalls,
        ...(parsed.usage !== undefined ? { usage: parsed.usage } : {}),
      };
    },

    close: async () => {
      await mcpClient.close();
    },
  };
}
