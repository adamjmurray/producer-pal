// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Telling result files apart from the other files in a run folder, and reading
 * them.
 */

import { readFile } from "node:fs/promises";
import { type JsonEvalResult, type JsonJudge } from "./types.ts";

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

/**
 * Rename the old "jev" judge names to "decider" in place, so the rest of the
 * code sees one shape. Results saved before the rename have `decidedBy: "jev"`,
 * `provider: "jev"` and a `jev` field where new ones have `decider`.
 *
 * @param result - A parsed result file
 * @returns The same result
 */
export function normalizeLegacyJudge(result: JsonEvalResult): JsonEvalResult {
  const judge = (result as JsonEvalResult | null)?.judge as
    | (Omit<JsonJudge, "decidedBy"> & { decidedBy?: string; jev?: unknown })
    | undefined;

  if (judge == null) {
    return result;
  }

  if (judge.decidedBy === "jev") {
    judge.decidedBy = "decider";
  }

  if (judge.provider === "jev") {
    judge.provider = "decider";
  }

  if (judge.jev != null) {
    judge.decider ??= judge.jev as JsonJudge["decider"];
    delete judge.jev;
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
