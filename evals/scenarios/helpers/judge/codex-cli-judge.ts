// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codexJudgeArgs,
  parseCodexStream,
} from "#evals/chat/codex/codex-cli-protocol.ts";
import { spawnCodex } from "#evals/chat/codex/codex-cli.ts";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "../judge-response-parser.ts";
import { printJudgeHeader, printJudgeResult } from "./judge-output.ts";

export const CODEX_CODE_JUDGE_MODEL = "luna";

/**
 * Run an isolated Codex subscription model as the LLM judge.
 * @param prompt - Evaluation prompt
 * @param systemPrompt - Judge instructions
 * @param model - Optional model alias or ID
 * @param criteria - Criteria shown in console output
 * @returns Parsed judge result
 */
export async function callCodexCliJudge(
  prompt: string,
  systemPrompt: string,
  model: string | undefined,
  criteria: string,
): Promise<JudgeResult> {
  const judgeModel = model ?? CODEX_CODE_JUDGE_MODEL;
  const workingDir = await mkdtemp(join(tmpdir(), "producer-pal-judge-"));
  const instructionsFile = join(workingDir, "instructions.md");

  printJudgeHeader("codex-code", judgeModel, criteria);

  try {
    await writeFile(instructionsFile, systemPrompt, "utf8");
    const stdout = await spawnCodex(
      codexJudgeArgs(judgeModel, instructionsFile),
      prompt,
      { cwd: workingDir },
    );
    const parsed = parseJudgeResponse(parseCodexStream(stdout).text.trim());

    printJudgeResult(parsed);

    return parsed;
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
}
