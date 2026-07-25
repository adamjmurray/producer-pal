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
import { CODEX_CODE_CONFIG } from "#evals/shared/provider-configs.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { connectMcp } from "../mcp.ts";
import { printStepUsage } from "../shared/formatting.ts";
import { type TurnResult } from "../shared/types.ts";
import {
  codexCliProtocol,
  DEFAULT_CODEX_SYSTEM_PROMPT,
  parseCodexStream,
} from "./codex-cli-protocol.ts";
import { spawnCodex } from "./codex-cli.ts";
import { formatCodexTurn } from "./format-codex-turn.ts";

export interface CodexCliSessionOptions {
  instructions?: string;
  mcpUrl?: string;
  model?: string;
  /** Print per-turn token usage (the CLI's -u/--usage flag). */
  usage?: boolean;
}

/**
 * Create a multi-turn Codex session backed by Producer Pal's MCP server.
 * @param options - Model, instructions, and optional MCP URL
 * @returns Eval session compatible with the scenario runner
 */
export async function createCodexCliSession(
  options: CodexCliSessionOptions,
): Promise<EvalSession> {
  const model = options.model ?? CODEX_CODE_CONFIG.defaultModel;
  const mcpUrl = options.mcpUrl ?? MCP_URL;
  const sessionDir = await mkdtemp(join(tmpdir(), "producer-pal-codex-"));
  const instructionsFile = join(sessionDir, "instructions.md");

  try {
    await writeFile(
      instructionsFile,
      options.instructions ?? DEFAULT_CODEX_SYSTEM_PROMPT,
      "utf8",
    );
  } catch (error) {
    await rm(sessionDir, { recursive: true, force: true });
    throw error;
  }

  let mcpClient: Awaited<ReturnType<typeof connectMcp>>["client"];

  try {
    ({ client: mcpClient } = await connectMcp(mcpUrl));
  } catch (error) {
    await rm(sessionDir, { recursive: true, force: true });
    throw error;
  }

  let threadId: string | undefined;
  let prevUsage: TokenUsage | undefined;

  return {
    mcpClient,
    sendMessage: async (
      message: string,
      turnNumber: number,
    ): Promise<TurnResult> => {
      logTurnStart(turnNumber, message);
      const args = codexCliProtocol({
        instructionsFile,
        mcpUrl,
        model,
        ...(threadId != null ? { resumeThreadId: threadId } : {}),
      });
      const parsed = parseCodexStream(
        await spawnCodex(args, message, { cwd: sessionDir }),
      );

      // eslint-disable-next-line require-atomic-updates -- turns run sequentially
      if (parsed.threadId != null) threadId = parsed.threadId;

      const usage = options.usage === true ? parsed.usage : undefined;

      if (!isQuietMode()) {
        process.stdout.write(formatCodexTurn(parsed, usage != null));
      }

      if (usage != null) {
        // Codex reports usage once per turn (turn.completed), not per step, so
        // there is one line per turn rather than one per tool round-trip.
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
