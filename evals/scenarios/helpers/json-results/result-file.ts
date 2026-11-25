// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Telling result files apart from the other files in a run folder, and reading
 * them.
 */

import { readFile } from "node:fs/promises";
import {
  type JsonDeciderAnswer,
  type JsonEvalResult,
  type JsonJudge,
} from "./types.ts";

/** A run's saved command line and options, for `--resume`; not a result. */
export const RUN_RECORD_FILE = "run.json";

/**
 * Whether a file in a run folder is a trial result.
 *
 * @param name - File name
 * @returns True for result files
 */
export function isResultFile(name: string): boolean {
  return name.endsWith(".json") && name !== RUN_RECORD_FILE;
}

/** The scale of outcome scores saved before `maxScore` was recorded. */
const LEGACY_OUTCOME_MAX_SCORE = 3;

/** The names older results used for the decider's fields. */
type LegacyJudge = Omit<JsonJudge, "decidedBy" | "decider"> & {
  decidedBy?: string;
  decider?: LegacyAnswer;
  jev?: LegacyAnswer;
};
type LegacyAnswer = Omit<Partial<JsonDeciderAnswer>, "outcome"> & {
  route?: string;
  outcome?: Omit<JsonDeciderAnswer["outcome"], "maxScore"> & {
    maxScore?: number;
  };
};

/**
 * Bring a result saved under older names up to the current shape, in place, so
 * the rest of the code sees one shape:
 * - the decider was called "jev": `decidedBy: "jev"`, `provider: "jev"` and a
 *   `jev` field, now `decider` (the old provider meant TypeSafe's Jev);
 * - its answer named the provider `route`;
 * - an outcome without `maxScore` was on the 0-3 scale.
 *
 * @param result - A parsed result file
 * @returns The same result
 */
export function normalizeLegacyJudge(result: JsonEvalResult): JsonEvalResult {
  const judge = (result as JsonEvalResult | null)?.judge as
    | LegacyJudge
    | undefined;

  if (judge == null) {
    return result;
  }

  if (judge.jev != null) {
    judge.decider ??= judge.jev;
    delete judge.jev;
  }

  const answer = judge.decider;

  if (answer != null) {
    if (answer.route != null) {
      answer.provider ??= answer.route;
      delete answer.route;
    }

    if (answer.outcome != null) {
      answer.outcome.maxScore ??= LEGACY_OUTCOME_MAX_SCORE;
    }
  }

  if (judge.decidedBy === "jev") {
    judge.decidedBy = "decider";
  }

  if (judge.provider === "jev" || judge.provider === "decider") {
    judge.provider = answer?.provider ?? "typesafe";
  }

  return result;
}

/**
 * Read a result file. A run killed mid-write can leave one cut short, so a
 * file that isn't valid JSON reads as undefined instead of throwing.
 *
 * @param path - File path
 * @returns The result, or undefined when the file isn't valid JSON
 */
export async function readResultFile(
  path: string,
): Promise<JsonEvalResult | undefined> {
  const text = await readFile(path, "utf8");

  try {
    return normalizeLegacyJudge(JSON.parse(text) as JsonEvalResult);
  } catch {
    return undefined;
  }
}
