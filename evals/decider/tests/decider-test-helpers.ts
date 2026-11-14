// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Test helpers for code that reads the decider API keys from the environment.
 */

import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import {
  type DeciderJudgeResult,
  type DeciderQuestionResult,
} from "../decider-judge.ts";
import { DECIDER_PROVIDERS } from "../decider-provider.ts";

/**
 * Set the hosted providers' keys; unlisted ones are blanked.
 *
 * @param keys - Values by env var name
 */
export function stubKeys(keys: Record<string, string> = {}): void {
  for (const { envVar } of Object.values(DECIDER_PROVIDERS)) {
    if (envVar != null) {
      vi.stubEnv(envVar, keys[envVar] ?? "");
    }
  }
}

/**
 * A decider answer with the given fields changed.
 *
 * @param fields - Fields to override
 * @returns A complete answer
 */
export function fakeAnswer(
  fields: Partial<DeciderJudgeResult> = {},
): DeciderJudgeResult {
  return {
    provider: "typesafe",
    verdict: "pass",
    minProbability: 0.95,
    questions: [],
    outcome: {
      score: 5,
      maxScore: 5,
      confidence: 1,
      label: "complete success",
    },
    model: "jev-1",
    inputTokens: 10,
    outputTokens: 1,
    truncated: false,
    ...fields,
  };
}

/**
 * A question answer.
 *
 * @param id - Question id ("claims" makes it the claims question)
 * @param probability - P(yes)
 * @returns The question result
 */
export function fakeQuestion(
  id: string,
  probability: number,
): DeciderQuestionResult {
  return {
    id,
    kind: id === "claims" ? "claims" : "requirement",
    text: id,
    probability,
  };
}

/**
 * A fresh temp directory holding an empty `run1` folder, for result files.
 *
 * @param prefix - The temp directory's name prefix
 * @returns The directory's path
 */
export async function makeRunDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));

  await mkdir(join(dir, "run1"));

  return dir;
}
