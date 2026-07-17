// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type EvalSession } from "#evals/scenarios/eval-session.ts";
import { logTurnStart } from "#evals/scenarios/helpers/eval-session-base.ts";
import { connectMcp } from "../mcp.ts";
import { type TurnResult } from "../shared/types.ts";
import {
  codexCliProtocol,
  DEFAULT_CODEX_SYSTEM_PROMPT,
  parseCodexStream,
} from "./codex-cli-protocol.ts";
import { spawnCodex } from "./codex-cli.ts";

export const CODEX_CODE_DEFAULT_MODEL = "terra";
const DEFAULT_MCP_URL = "http://localhost:3350/mcp";

export interface CodexCliSessionOptions {
  instructions?: string;
  mcpUrl?: string;
  model?: string;
}

/**
 * Create a multi-turn Codex session backed by Producer Pal's MCP server.
 * @param options - Model, instructions, and optional MCP URL
 * @returns Eval session compatible with the scenario runner
 */
export async function createCodexCliSession(
  options: CodexCliSessionOptions,
): Promise<EvalSession> {
  const model = options.model ?? CODEX_CODE_DEFAULT_MODEL;
  const mcpUrl = options.mcpUrl ?? process.env.MCP_URL ?? DEFAULT_MCP_URL;
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
