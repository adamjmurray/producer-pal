// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The trials an earlier attempt at a run already finished, for `--resume`. A
 * trial that errored doesn't count as done: it runs again, and its new result
 * replaces the error's file.
 */

import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { isResultFile } from "../../json-results/result-file.ts";
import { type JsonEvalResult } from "../../json-results/types.ts";

export interface ResumedTrials {
  /** Finished trials, by `trialKey`. */
  done: Map<string, JsonEvalResult>;
  /** The file of each errored trial, by `trialKey`. */
  errored: Map<string, string>;
}

/**
 * Load the trials stored in a run's results folder.
 *
 * @param dir - The run's results folder
 * @returns Finished trials and errored trials' files
 */
export async function loadResumedTrials(dir: string): Promise<ResumedTrials> {
  const resumed: ResumedTrials = { done: new Map(), errored: new Map() };
  const files = await readdir(dir);

  for (const file of files.filter(isResultFile)) {
    const path = join(dir, file);
    const result = await readResult(path);

    // A file cut short when the run was killed: the trial runs again.
    if (result == null) {
      continue;
    }

    const key = trialKey(
      result.scenarioId,
      result.model,
      result.configProfileId,
      result.trial ?? 1,
    );

    if (result.result === "error") {
      resumed.errored.set(key, path);
    } else {
      resumed.done.set(key, result);
    }
  }

  return resumed;
}

/**
 * Read a result file.
 *
 * @param path - File path
 * @returns The result, or undefined when the file isn't valid JSON
 */
async function readResult(path: string): Promise<JsonEvalResult | undefined> {
  const text = await readFile(path, "utf8");

  try {
    return JSON.parse(text) as JsonEvalResult;
  } catch {
    return undefined;
  }
}

/**
 * Identify a trial by its fields, not its file name: the name drops the trial
 * number when the run had one round, so it changes if a resume adds rounds.
 *
 * @param scenarioId - Scenario id
 * @param model - `provider/model`
 * @param label - Run-environment label
 * @param trial - Trial number, 1-indexed
 * @returns The key
 */
export function trialKey(
  scenarioId: string,
  model: string,
  label: string,
  trial: number,
): string {
  return JSON.stringify([scenarioId, model, label, trial]);
}

/**
 * Remove an errored trial's old file once its rerun is saved under a different
 * name, so the folder holds one result per trial.
 *
 * @param resumed - The resumed trials
 * @param key - The rerun trial's key
 * @param savedPath - Where the rerun's result was saved
 */
export async function dropReplacedError(
  resumed: ResumedTrials,
  key: string,
  savedPath: string,
): Promise<void> {
  const oldPath = resumed.errored.get(key);

  if (oldPath != null && oldPath !== savedPath) {
    await rm(oldPath, { force: true });
  }
}
