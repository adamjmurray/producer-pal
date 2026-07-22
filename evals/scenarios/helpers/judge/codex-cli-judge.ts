// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
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
  finishJudgeOutput,
  printJudgeChunk,
  printJudgeHeader,
} from "./judge-output.ts";

export const CODEX_CODE_JUDGE_MODEL = "luna";

/**
 * Run an isolated Codex subscription model as the LLM judge.
 * @param prompt - Evaluation prompt
 * @param systemPrompt - Judge instructions
 * @param judgeModel - Resolved model alias or ID (see CODEX_CODE_JUDGE_MODEL)
 * @param criteria - Criteria shown in console output
 * @returns Raw judge response
 */
export async function callCodexCliJudge(
  prompt: string,
  systemPrompt: string,
  judgeModel: string,
  criteria: string,
): Promise<string> {
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
    const text = parseCodexStream(stdout).text.trim();

    printJudgeChunk(text);
    finishJudgeOutput();

    return text;
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
}
