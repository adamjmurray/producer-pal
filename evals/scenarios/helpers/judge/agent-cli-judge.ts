// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnAgentCli } from "#evals/chat/agent-cli/agent-cli-spawn.ts";
import { type AgentCliTransport } from "#evals/chat/agent-cli/agent-cli-transport.ts";
import {
  finishJudgeOutput,
  printJudgeChunk,
  printJudgeHeader,
} from "./judge-output.ts";

/**
 * Run an isolated agent-CLI subscription model as the LLM judge.
 *
 * @param transport - Transport describing the CLI to drive
 * @param prompt - Evaluation prompt
 * @param systemPrompt - Judge instructions
 * @param judgeModel - Friendly alias or explicit model ID
 * @param criteria - Criteria shown in console output
 * @returns Raw judge response
 */
export async function callAgentCliJudge(
  transport: AgentCliTransport,
  prompt: string,
  systemPrompt: string,
  judgeModel: string,
  criteria: string,
): Promise<string> {
  const workingDir = await mkdtemp(join(tmpdir(), "producer-pal-judge-"));
  const instructionsFile = join(workingDir, "instructions.md");

  printJudgeHeader(transport.provider, judgeModel, criteria);

  try {
    await writeFile(instructionsFile, systemPrompt, "utf8");
    const args = transport.buildJudgeArgs({
      instructions: systemPrompt,
      instructionsFile,
      model: judgeModel,
    });
    const stdout = await spawnAgentCli(transport, args, prompt, {
      cwd: workingDir,
    });
    const text = transport.parseStream(stdout).text.trim();

    printJudgeChunk(text);
    finishJudgeOutput();

    return text;
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
}
