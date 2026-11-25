// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Find when a scenario's judge criteria last changed. Saved results don't keep
 * the criteria they were judged by, so older results can't be compared with
 * the current wording.
 */

import { execFileSync } from "node:child_process";

/** Shorter lines are too common to tell wordings apart. */
const MIN_LINE_LENGTH = 15;

/**
 * Newest commit date that touched any line of the prompt.
 *
 * @param prompt - The scenario's current llm_judge prompt
 * @returns ISO date, or undefined when no line is in git history
 */
export function lastCriteriaChange(prompt: string): string | undefined {
  const dates: number[] = [];

  for (const line of prompt.split("\n")) {
    const needle = line.trim();

    if (needle.length <= MIN_LINE_LENGTH) {
      continue;
    }

    const out = execFileSync(
      "git",
      ["log", "-1", "-S", needle, "--format=%cI", "--", "evals/scenarios"],
      { encoding: "utf8" },
    ).trim();

    if (out !== "") {
      dates.push(new Date(out).getTime());
    }
  }

  return dates.length === 0
    ? undefined
    : new Date(Math.max(...dates)).toISOString();
}
