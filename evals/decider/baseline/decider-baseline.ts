// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Compares a decider with a baseline decider on saved eval results, with no
 * LLM verdict needed: the baseline is either the answer a `--decider` run saved
 * or a fresh call to another decider.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  resolveDecider,
  type DeciderSpec,
  type ResolvedDecider,
} from "../decider-provider.ts";
import { deciderJudge, type DeciderJudgeResult } from "../decider-judge.ts";
import { recordedDecider } from "./decider-recorded.ts";
import {
  judgeChecks,
  loadJudgedResults,
  type JudgedResult,
  type LoadOptions,
} from "../decider-results.ts";
import { mapConcurrent } from "../map-concurrent.ts";
import { providerLanes, type ProviderLanes } from "./provider-lanes.ts";
import { baselineReport, sideName } from "./decider-baseline-report.ts";
import { type BaselineEntry, type LeftOut } from "./decider-baseline-stats.ts";

type Side = Pick<ResolvedDecider, "provider" | "model">;

/** Test seams: the decider call and who it is, and how scenarios and criteria load. */
export interface CompareDeps {
  decider?: typeof deciderJudge;
  resolved?: Side;
  /** The fresh baseline decider, when the baseline is not the recorded answers */
  baselineResolved?: Side;
  load?: Pick<LoadOptions, "scenarios" | "criteriaDate">;
  log?: (text: string) => void;
}

export interface BaselineOptions {
  /** "recorded" reads the answers saved in the results; a spec calls that decider */
  baseline: "recorded" | DeciderSpec;
  decider?: DeciderSpec;
  runIds?: string[];
  scenarioIds: string[];
  limit?: number;
  concurrency?: number;
  includeStale: boolean;
  resultsDir: string;
}

/** One side's answer for one result, and how long the call took (none if recorded). */
type SideAnswer =
  | { answer: DeciderJudgeResult; seconds?: number }
  | { error: string };

/** A saved result and how to get the baseline's answer for it. */
interface Candidate {
  item: JudgedResult;
  baseline: () => Promise<SideAnswer>;
}

/**
 * Run the comparison and print the report.
 *
 * @param options - What to compare
 * @param deps - Test seams
 * @returns Promise resolving once the report is printed and saved
 */
export async function compareToBaseline(
  options: BaselineOptions,
  deps: CompareDeps = {},
): Promise<void> {
  const log = deps.log ?? ((text: string) => console.log(text));
  const decider = deps.resolved ?? resolveDecider(options.decider);
  const fresh =
    options.baseline === "recorded"
      ? undefined
      : (deps.baselineResolved ?? resolveDecider(options.baseline));
  const { items, skipped } = await loadJudgedResults({
    ...deps.load,
    runIds: options.runIds,
    scenarioIds:
      options.scenarioIds.length > 0 ? options.scenarioIds : undefined,
    includeStale: options.includeStale,
    resultsDir: options.resultsDir,
  });
  const lanes = providerLanes(options.concurrency);
  const judge = deps.decider ?? deciderJudge;
  const leftOut: LeftOut[] = [];
  const candidates =
    fresh == null
      ? recordedCandidates(items, leftOut)
      : items.map((item) => ({
          item,
          baseline: () => callDecider(lanes, judge, fresh, item),
        }));
  const selected =
    options.limit == null ? candidates : candidates.slice(0, options.limit);
  const baselineText =
    fresh == null
      ? "the recorded decider answers"
      : `${fresh.provider}/${fresh.model}`;

  log(
    `Comparing ${decider.provider}/${decider.model} with ${baselineText} on ${selected.length} of ${candidates.length} saved result(s)...`,
  );

  const parallel = Math.max(
    lanes.limit(decider.provider),
    fresh == null ? 0 : lanes.limit(fresh.provider),
  );
  const compared = await mapConcurrent(selected, parallel, async (c) => {
    const [b, d] = await Promise.all([
      c.baseline(),
      callDecider(lanes, judge, decider, c.item),
    ]);

    return { item: c.item, b, d };
  });
  const entries: BaselineEntry[] = [];

  for (const { item, b, d } of compared) {
    if ("answer" in b && "answer" in d) {
      entries.push(toEntry(item, b, d));
    }

    for (const [side, answer] of [
      ["baseline", b],
      ["decider", d],
    ] as const) {
      if ("error" in answer) {
        leftOut.push({
          file: item.file,
          side,
          reason: answer.error,
          error: true,
        });
      }
    }
  }

  const baselineLabel = `${sideName(entries, "baseline", baselineText)} (${fresh == null ? "recorded" : "fresh"})`;
  const deciderLabel = sideName(
    entries,
    "decider",
    `${decider.provider}/${decider.model}`,
  );
  const report = baselineReport({
    entries,
    leftOut,
    skipped,
    baselineLabel,
    deciderLabel,
  });

  log(`\n${report.join("\n")}`);

  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const path = join(options.resultsDir, `decider-compare-${stamp}.json`);
  const json = {
    mode: "baseline",
    baselineLabel,
    deciderLabel,
    skipped,
    leftOut,
    entries,
  };

  await writeFile(path, JSON.stringify(json, null, 2) + "\n");
  log(`\nFull report: ${path}`);
}

/**
 * Take each result's saved decider answer as the baseline. Results with none,
 * or whose call failed in the run, are left out and recorded.
 *
 * @param items - Loaded results
 * @param leftOut - Collects the results left out
 * @returns The results with a usable saved answer
 */
function recordedCandidates(
  items: JudgedResult[],
  leftOut: LeftOut[],
): Candidate[] {
  const out: Candidate[] = [];

  for (const item of items) {
    const saved = recordedDecider(item.result, item.criteria);

    if (saved == null || "error" in saved) {
      leftOut.push({
        file: item.file,
        side: "baseline",
        reason: saved == null ? "no saved answer" : saved.error,
        error: saved != null,
      });
    } else {
      out.push({
        item,
        baseline: async () => ({ answer: saved.decider }),
      });
    }
  }

  return out;
}

/**
 * Ask a decider about one result through its provider's lane. A failure is
 * returned, not thrown.
 *
 * @param lanes - Per-provider call limits
 * @param judge - The decider judge
 * @param side - The decider to call
 * @param item - The saved result and its criteria
 * @returns The answer and how long the call took, or the error
 */
async function callDecider(
  lanes: ProviderLanes,
  judge: typeof deciderJudge,
  side: Side,
  item: JudgedResult,
): Promise<SideAnswer> {
  return await lanes.run(side.provider, async () => {
    const started = performance.now();

    try {
      const answer = await judge(
        { turns: item.result.turns, checks: judgeChecks(item.result) },
        item.criteria,
        { provider: side.provider, model: side.model },
      );

      return { answer, seconds: (performance.now() - started) / 1000 };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  });
}

/**
 * Build the entry for a result both sides answered.
 *
 * @param item - The saved result
 * @param b - The baseline's answer
 * @param d - The decider's answer
 * @returns The entry
 */
function toEntry(
  item: JudgedResult,
  b: Extract<SideAnswer, { answer: DeciderJudgeResult }>,
  d: Extract<SideAnswer, { answer: DeciderJudgeResult }>,
): BaselineEntry {
  const { result } = item;
  const judge = result.judge;
  // After an escalation the LLM judge's own verdict; else the stored one,
  // unless the decider decided it (then there is no LLM verdict).
  const llmPass =
    judge?.llm?.pass ??
    (judge?.decidedBy === "decider" ? undefined : judge?.pass);

  return {
    file: item.file,
    scenarioId: result.scenarioId,
    checksPass: result.checks.pass,
    ...(llmPass != null && { llmPass }),
    baseline: b.answer,
    decider: d.answer,
    ...(b.seconds != null && { baselineSeconds: b.seconds }),
    ...(d.seconds != null && { deciderSeconds: d.seconds }),
  };
}
