// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type EvalSession } from "#evals/scenarios/eval-session.ts";
import { logTurnStart } from "#evals/scenarios/helpers/eval-session-base.ts";
import { isQuietMode } from "#evals/scenarios/helpers/output-config.ts";
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { PROVIDER_CONFIGS } from "#evals/shared/provider-configs.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { connectMcp } from "../mcp.ts";
import { printStepUsage } from "../shared/formatting.ts";
import { type TurnResult } from "../shared/types.ts";
import { spawnAgentCli } from "./agent-cli-spawn.ts";
import {
  type AgentCliTransport,
  DEFAULT_AGENT_CLI_SYSTEM_PROMPT,
} from "./agent-cli-transport.ts";
import { formatAgentTurn } from "./format-agent-turn.ts";

export interface AgentCliSessionOptions {
  instructions?: string;
  mcpUrl?: string;
  model?: string;
  /** Print per-turn token usage (the CLI's -u/--usage flag). */
  usage?: boolean;
}

/**
 * Create a multi-turn agent-CLI session backed by Producer Pal's MCP server.
 *
 * Each turn is a fresh subprocess; continuity comes from replaying the session
 * id the CLI reported on the previous turn, so the CLI — not this process —
 * owns the conversation history.
 *
 * @param transport - Transport describing the CLI to drive
 * @param options - Model, instructions, and optional MCP URL
 * @returns Eval session compatible with the scenario runner
 */
export async function createAgentCliSession(
  transport: AgentCliTransport,
  options: AgentCliSessionOptions,
): Promise<EvalSession> {
  const model =
    options.model ?? PROVIDER_CONFIGS[transport.provider].defaultModel;
  const mcpUrl = options.mcpUrl ?? MCP_URL;
  const instructions = options.instructions ?? DEFAULT_AGENT_CLI_SYSTEM_PROMPT;
  const sessionDir = await mkdtemp(join(tmpdir(), transport.tmpPrefix));
  const instructionsFile = join(sessionDir, "instructions.md");

  let mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];

  try {
    await writeFile(instructionsFile, instructions, "utf8");
    ({ client: mcpClient } = await connectMcp(mcpUrl));
  } catch (error) {
    await rm(sessionDir, { recursive: true, force: true });
    throw error;
  }

  let sessionId: string | undefined;
  let prevUsage: TokenUsage | undefined;

  return {
    mcpClient,
    sendMessage: async (
      message: string,
      turnNumber: number,
    ): Promise<TurnResult> => {
      logTurnStart(turnNumber, message);
      const args = transport.buildTurnArgs({
        instructions,
        instructionsFile,
        mcpUrl,
        model,
        ...(sessionId != null ? { resumeSessionId: sessionId } : {}),
      });
      const parsed = transport.parseStream(
        await spawnAgentCli(transport, args, message, { cwd: sessionDir }),
      );

      // eslint-disable-next-line require-atomic-updates -- turns run sequentially
      if (parsed.sessionId != null) sessionId = parsed.sessionId;

      const usage = options.usage === true ? parsed.usage : undefined;

      if (!isQuietMode()) {
        process.stdout.write(formatAgentTurn(parsed, usage != null));
      }

      if (usage != null) {
        // These CLIs report usage once per turn, not per step, so there is one
        // line per turn rather than one per tool round-trip.
        printStepUsage(usage, prevUsage, true);
        prevUsage = usage;
      }

      return {
        text: parsed.text,
        toolCalls: parsed.toolCalls,
        ...(parsed.usage != null ? { stepUsages: [parsed.usage] } : {}),
      };
    },
    close: async () => {
      try {
        await mcpClient.close();
      } finally {
        await rm(sessionDir, { recursive: true, force: true });
      }
    },
  };
}
