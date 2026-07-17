// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * LLM judge backed by the Claude CLI on the Claude Max subscription.
 *
 * The judge is a single-shot, structured-output call with no tools — Signal Studio's
 * original CLI-transport shape — so MCP is disabled here. Lets a fully-Max eval run
 * (models-under-test on `claude-code`, judge on `claude-code`) need zero API keys.
 */

import {
  buildJudgeArgs,
  parseJudgeEnvelope,
} from "#evals/chat/claude-cli-protocol.ts";
import { spawnClaude } from "#evals/chat/claude-cli.ts";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "../judge-response-parser.ts";
import { printJudgeHeader, printJudgeResult } from "./judge-output.ts";

/** Default judge model when `claude-code` is the judge with no model given. */
export const CLAUDE_CODE_JUDGE_MODEL = "haiku";

/**
 * Call a Claude-CLI judge (Claude Max billing, no tools).
 *
 * @param prompt - The evaluation prompt
 * @param systemPrompt - Judge system instructions
 * @param model - Optional judge model override (defaults to a cheap model)
 * @param criteria - Evaluation criteria for output display
 * @returns Parsed judge result with scores and reasoning
 */
export async function callClaudeCliJudge(
  prompt: string,
  systemPrompt: string,
  model: string | undefined,
  criteria: string,
): Promise<JudgeResult> {
  const judgeModel = model ?? CLAUDE_CODE_JUDGE_MODEL;

  printJudgeHeader("claude-code", judgeModel, criteria);

  const stdout = await spawnClaude(
    buildJudgeArgs(judgeModel, systemPrompt),
    prompt,
  );
  const text = parseJudgeEnvelope(stdout);
  const parsed = parseJudgeResponse(text.trim());

  printJudgeResult(parsed);

  return parsed;
}
